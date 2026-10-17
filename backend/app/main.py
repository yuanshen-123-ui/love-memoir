"""
============================================================================
 「我们的恋爱回忆录」后端
----------------------------------------------------------------------------
 干两件事，就两件：

   POST /api/upload            收表单 + 最多 20 张照片 → 存本地 → 返回 album_id
   GET  /api/album/{album_id}  按 id 取出完整配置 → 前端拿去播放

 设计取舍：
   · SQLite 单表 + 标准库 sqlite3：这个量级用 ORM 是负担
   · 图片存本地 static/uploads/<album_id>/<uuid>.jpg：不走 OSS，按需换即可
   · 上传时服务端再压一遍并**彻底洗掉 EXIF**：手机原图带 GPS，
     这是别人的隐私，不能原样存下来
   · 有单 IP 限流：公网站点不设防，很快就会被脚本塞满磁盘
============================================================================
"""

import hashlib
import json
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from . import config, db, ids, images
from .models import (
    AlbumPayload,
    AlbumResponse,
    CreateAlbumResponse,
    HealthResponse,
    PhotoOut,
)

# ---------------------------------------------------------------- 应用实例
app = FastAPI(
    title="love-memoir api",
    version="1.0.0",
    docs_url="/api/docs",  # 自家接口的在线文档，方便你调试
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)


# ---------------------------------------------------------------- 小工具
def _client_ip(request: Request) -> str:
    # 生产在 nginx 后面：优先用 X-Forwarded-For 的第一段
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{ip}{config.IP_SALT}".encode()).hexdigest()[:16]


_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def _rate_allowed(ip: str) -> bool:
    """一个很朴素的滑动窗口：单 IP 每小时最多 N 次上传。"""
    now = time.time()
    with _hits_lock:
        recent = [t for t in _hits.get(ip, []) if now - t < 3600]
        if len(recent) >= config.UPLOADS_PER_HOUR:
            _hits[ip] = recent
            return False
        recent.append(now)
        _hits[ip] = recent
        return True


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    """分块读，超限立刻中断 —— 不能等 200MB 全读进内存再判大小"""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(status_code=413, detail="单张照片太大了（上限 8MB）")
        chunks.append(chunk)
    return b"".join(chunks)


def _photo_out(album_id: str, rows: list[dict]) -> list[PhotoOut]:
    return [
        PhotoOut(
            url=f"{config.PUBLIC_BASE_URL}/static/uploads/{album_id}/{row['file']}",
            width=row["width"],
            height=row["height"],
        )
        for row in rows
    ]


def _share_url(album_id: str) -> str:
    return f"{config.PUBLIC_BASE_URL}/a/{album_id}"


# ---------------------------------------------------------------- 健康检查
@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    stat = db.stats()
    return HealthResponse(
        ok=True,
        albums=stat["albums"],
        views=stat["views"],
        max_photos=config.MAX_PHOTOS,
    )


# ---------------------------------------------------------------- 上传
@app.post("/api/upload", response_model=CreateAlbumResponse, status_code=201)
async def upload(
    request: Request,
    payload: str = Form(..., description="AlbumPayload 的 JSON 字符串"),
    photos: list[UploadFile] = File(..., description="最多 20 张照片"),
) -> CreateAlbumResponse:
    ip = _client_ip(request)

    if not _rate_allowed(ip):
        raise HTTPException(status_code=429, detail="上传太频繁了，歇一会儿再试吧")

    if not 1 <= len(photos) <= config.MAX_PHOTOS:
        raise HTTPException(
            status_code=400, detail=f"照片要有 1~{config.MAX_PHOTOS} 张，现在是 {len(photos)} 张"
        )

    if len(payload.encode("utf-8")) > config.MAX_PAYLOAD_JSON_BYTES:
        raise HTTPException(status_code=413, detail="表单内容太长了")

    try:
        data = AlbumPayload.model_validate_json(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        msg = first.get("msg", "格式不对")
        loc = ".".join(str(p) for p in first.get("loc", []) if not isinstance(p, int))
        raise HTTPException(
            status_code=422, detail=f"表单内容不合法：{loc or 'payload'} {msg}"
        ) from exc

    # 字幕不足就补空串，保证「第 i 张照片 ↔ 第 i 句字幕」对齐
    if len(data.captions) < len(photos):
        data.captions = data.captions + [""] * (len(photos) - len(data.captions))

    album_id = ids.new_album_id()
    dest_dir = config.UPLOAD_DIR / album_id
    dest_dir.mkdir(parents=True, exist_ok=False)

    saved: list[dict] = []
    total_bytes = 0
    try:
        for index, photo in enumerate(photos):
            raw = await _read_limited(photo, config.MAX_PHOTO_BYTES)
            total_bytes += len(raw)
            if total_bytes > config.MAX_TOTAL_BYTES:
                raise HTTPException(status_code=413, detail="照片总大小超出限制")
            try:
                # Pillow 是同步 CPU 活，丢线程池，别堵住事件循环
                info = await run_in_threadpool(
                    images.process, raw, dest_dir, config.IMAGE_MAX_SIDE, config.IMAGE_QUALITY
                )
            except images.ImageRejected as exc:
                raise HTTPException(
                    status_code=400, detail=f"第 {index + 1} 张照片无法处理：{exc}"
                ) from exc
            saved.append(info)
    except Exception:
        # 任何一步失败都把半成品目录清掉，不留垃圾
        shutil.rmtree(dest_dir, ignore_errors=True)
        raise

    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db.insert_album(album_id, data.model_dump(), saved, created_at, _hash_ip(ip))

    return CreateAlbumResponse(
        album_id=album_id,
        share_url=_share_url(album_id),
        created_at=created_at,
        photos=_photo_out(album_id, saved),
    )


# ---------------------------------------------------------------- 读取
@app.get("/api/album/{album_id}", response_model=AlbumResponse)
def get_album(album_id: str) -> AlbumResponse:
    if not ids.is_valid_album_id(album_id):
        raise HTTPException(status_code=404, detail="回忆录不存在")

    row: Optional[dict] = db.get_album(album_id)
    if row is None:
        raise HTTPException(status_code=404, detail="回忆录不存在")

    db.bump_views(album_id)

    return AlbumResponse(
        album_id=row["id"],
        share_url=_share_url(row["id"]),
        created_at=row["created_at"],
        views=row["views"] + 1,
        config=AlbumPayload.model_validate(row["payload"]),
        photos=_photo_out(row["id"], row["photos"]),
    )


# ---------------------------------------------------------------- 静态文件
# 注意：这个 mount 必须放在最后，否则它会抢走 /api 之外的路径也没关系，
# 但放在最后读起来最清楚：接口是接口，静态是静态。
config.ensure_dirs()
app.mount("/static", StaticFiles(directory=str(config.STATIC_DIR)), name="static")
