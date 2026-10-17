"""后端接口测试：上传 / 读取 / 限制 / 图片处理 / 限流 / 静态托管。"""

import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config
from app import main as app_main
from app.main import app


@pytest.fixture()
def client():
    return TestClient(app)


# ----------------------------------------------------------------- 造数据
def make_image(width=1200, height=900, color=(210, 150, 170), fmt="JPEG", exif=None) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color)
    if exif is not None:
        img.save(buf, fmt, exif=exif)
    else:
        img.save(buf, fmt)
    return buf.getvalue()


def make_payload(**overrides) -> str:
    data = {
        "title": "我们的恋爱回忆录",
        "author": "小陈",
        "partner": "小张",
        "met_at": "2024.10.10",
        "message": "想和你去看很多次日落。",
        "ending_line": "遇见你，是我最幸运的事。",
        "captions": ["第一张", "第二张", "第三张"],
        "questions": [
            {"question": "我们第一次见面在哪？", "options": ["图书馆", "食堂"], "answer": 0}
        ],
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


def photo_files(count: int, **kw):
    return [
        ("photos", (f"photo{i}.jpg", make_image(**kw), "image/jpeg")) for i in range(count)
    ]


def upload(client, count=3, payload=None, **kw):
    return client.post(
        "/api/upload",
        data={"payload": payload if payload is not None else make_payload()},
        files=photo_files(count, **kw),
    )


# ----------------------------------------------------------------- 基础
def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["max_photos"] == config.MAX_PHOTOS


def test_upload_then_fetch(client):
    res = upload(client, count=3)
    assert res.status_code == 201, res.text

    body = res.json()
    album_id = body["album_id"]
    assert 8 <= len(album_id) <= 32
    assert body["share_url"] == f"https://test.local/a/{album_id}"
    assert len(body["photos"]) == 3

    first = body["photos"][0]
    assert first["url"] == f"https://test.local/static/uploads/{album_id}/" + first["url"].rsplit("/", 1)[-1]
    assert first["width"] > 0 and first["height"] > 0

    got = client.get(f"/api/album/{album_id}")
    assert got.status_code == 200
    album = got.json()
    assert album["album_id"] == album_id
    assert album["config"]["partner"] == "小张"
    assert album["config"]["met_at"] == "2024.10.10"
    assert len(album["photos"]) == 3
    assert album["views"] >= 1


def test_uploaded_photo_is_really_served(client):
    body = upload(client, count=1).json()
    url = body["photos"][0]["url"].replace("https://test.local", "")
    res = client.get(url)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    # 真的是一张能打开的 JPEG
    Image.open(io.BytesIO(res.content)).verify()


def test_views_increase(client):
    album_id = upload(client, count=1).json()["album_id"]
    v1 = client.get(f"/api/album/{album_id}").json()["views"]
    v2 = client.get(f"/api/album/{album_id}").json()["views"]
    assert v2 == v1 + 1


# ----------------------------------------------------------------- 图片处理
def test_image_is_resized(client):
    body = upload(client, count=1, width=3000, height=2000).json()
    assert body["photos"][0]["width"] <= config.IMAGE_MAX_SIDE
    assert body["photos"][0]["height"] <= config.IMAGE_MAX_SIDE


def test_exif_is_stripped(client):
    """手机原图带 GPS，存下来之前必须洗掉"""
    img = Image.new("RGB", (400, 300), (120, 90, 80))
    exif = img.getexif()
    exif[271] = "TestPhone"  # Make
    exif[272] = "TestModel"  # Model
    raw = make_image(400, 300, exif=exif.tobytes())

    res = client.post(
        "/api/upload",
        data={"payload": make_payload()},
        files=[("photos", ("p.jpg", raw, "image/jpeg"))],
    )
    assert res.status_code == 201, res.text

    album_id = res.json()["album_id"]
    stored = next((config.UPLOAD_DIR / album_id).glob("*.jpg"))
    with Image.open(stored) as saved:
        saved_exif = saved.getexif()
    assert not dict(saved_exif), f"EXIF 没洗干净：{dict(saved_exif)}"


def test_png_with_transparency_becomes_jpeg(client):
    buf = io.BytesIO()
    Image.new("RGBA", (300, 200), (255, 255, 255, 0)).save(buf, "PNG")
    res = client.post(
        "/api/upload",
        data={"payload": make_payload()},
        files=[("photos", ("p.png", buf.getvalue(), "image/png"))],
    )
    assert res.status_code == 201, res.text
    url = res.json()["photos"][0]["url"].replace("https://test.local", "")
    assert client.get(url).headers["content-type"] == "image/jpeg"


# ----------------------------------------------------------------- 校验
def test_reject_non_image(client):
    res = client.post(
        "/api/upload",
        data={"payload": make_payload()},
        files=[("photos", ("x.jpg", b"this is definitely not a jpeg", "image/jpeg"))],
    )
    assert res.status_code == 400
    assert "第 1 张" in res.json()["detail"]


def test_reject_no_photos(client):
    res = client.post("/api/upload", data={"payload": make_payload()})
    assert res.status_code == 422


def test_reject_too_many_photos(client):
    res = upload(client, count=config.MAX_PHOTOS + 1)
    assert res.status_code == 400
    assert "1~20" in res.json()["detail"]


def test_reject_bad_payload_json(client):
    res = upload(client, count=1, payload="{not json")
    assert res.status_code == 422


def test_reject_too_long_title(client):
    res = upload(client, count=1, payload=make_payload(title="啊" * 31))
    assert res.status_code == 422


def test_reject_bad_quiz_answer(client):
    res = upload(
        client,
        count=1,
        payload=make_payload(
            questions=[{"question": "?", "options": ["a", "b"], "answer": 5}]
        ),
    )
    assert res.status_code == 422


def test_reject_too_many_captions(client):
    res = upload(client, count=1, payload=make_payload(captions=["x"] * 21))
    assert res.status_code == 422


def test_captions_are_padded(client):
    """字幕给了 1 条、照片 3 张 → 返回时补成 3 条，保证一一对应"""
    res = upload(client, count=3, payload=make_payload(captions=["只有一句"]))
    assert res.status_code == 201
    album_id = res.json()["album_id"]
    caps = client.get(f"/api/album/{album_id}").json()["config"]["captions"]
    assert caps == ["只有一句", "", ""]


# ----------------------------------------------------------------- 404 / 格式
def test_unknown_album_404(client):
    res = client.get("/api/album/Zm9vYmFyMDEyMw")
    assert res.status_code == 404


def test_malformed_album_id_404(client):
    for bad in ["..", "a", "../etc/passwd", "a" * 40, "has space"]:
        assert client.get(f"/api/album/{bad}").status_code in (404, 422)


# ----------------------------------------------------------------- 限流
def test_rate_limit(client):
    original = config.UPLOADS_PER_HOUR
    config.UPLOADS_PER_HOUR = 2
    app_main._hits.clear()
    try:
        assert upload(client, count=1).status_code == 201
        assert upload(client, count=1).status_code == 201
        third = upload(client, count=1)
        assert third.status_code == 429
        assert "频繁" in third.json()["detail"]
    finally:
        config.UPLOADS_PER_HOUR = original
        app_main._hits.clear()
