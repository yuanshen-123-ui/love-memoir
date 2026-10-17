"""
SQLite 存取（只用标准库 sqlite3，不引 ORM —— 一共就一张表，没必要）。

并发说明：
  uvicorn 单进程 + 一个模块级连接 + 一把线程锁。
  写操作极少（一次上传一条、一次浏览一次 +1），这点竞争完全够用。
  如果要开多 worker，SQLite 的 WAL 模式也能扛，但那种量级就不该用 SQLite 了。
"""

import json
import sqlite3
import threading
from typing import Any, Optional

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS albums (
    id          TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,   -- 用户填的全部文案（JSON）
    photos      TEXT NOT NULL,   -- [{file,width,height}]（JSON）
    created_at  TEXT NOT NULL,   -- ISO8601 UTC
    ip_hash     TEXT,            -- sha256(ip + salt)[:16]，不存明文 IP
    views       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_albums_created_at ON albums (created_at);
"""

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        config.ensure_dirs()
        _conn = sqlite3.connect(str(config.DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.executescript(SCHEMA)
        _conn.commit()
    return _conn


def insert_album(album_id: str, payload: dict, photos: list[dict], created_at: str, ip_hash: str) -> None:
    with _lock:
        conn = connect()
        conn.execute(
            "INSERT INTO albums (id, payload, photos, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)",
            (
                album_id,
                json.dumps(payload, ensure_ascii=False),
                json.dumps(photos, ensure_ascii=False),
                created_at,
                ip_hash,
            ),
        )
        conn.commit()


def get_album(album_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        conn = connect()
        row = conn.execute("SELECT * FROM albums WHERE id = ?", (album_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "payload": json.loads(row["payload"]),
        "photos": json.loads(row["photos"]),
        "created_at": row["created_at"],
        "views": row["views"],
    }


def bump_views(album_id: str) -> None:
    with _lock:
        conn = connect()
        conn.execute("UPDATE albums SET views = views + 1 WHERE id = ?", (album_id,))
        conn.commit()


def stats() -> dict[str, int]:
    with _lock:
        conn = connect()
        row = conn.execute("SELECT COUNT(*) AS c, COALESCE(SUM(views), 0) AS v FROM albums").fetchone()
    return {"albums": int(row["c"]), "views": int(row["v"])}
