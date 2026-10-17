"""
配置：全部从环境变量读，默认值就是「生产怎么跑」，本地不配也能起来。

.env.example 里列了每一项。
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

DATA_DIR = Path(os.getenv("LOVE_DATA_DIR", str(BASE_DIR / "data")))
STATIC_DIR = Path(os.getenv("LOVE_STATIC_DIR", str(BASE_DIR / "static")))
UPLOAD_DIR = STATIC_DIR / "uploads"
DB_PATH = DATA_DIR / "albums.db"

# 生成出来的分享链接前缀（前端 /a/{album_id} 就是播放页）
PUBLIC_BASE_URL = os.getenv("LOVE_PUBLIC_BASE_URL", "https://love.ccflysim.cn").rstrip("/")

# 允许跨域的前端地址（生产是同域反代，其实用不到；留着方便本地 5174 直连 8000）
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "LOVE_ALLOWED_ORIGINS",
        "https://love.ccflysim.cn,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",")
    if o.strip()
]

# 上传限制
MAX_PHOTOS = int(os.getenv("LOVE_MAX_PHOTOS", "20"))
MAX_PHOTO_BYTES = int(os.getenv("LOVE_MAX_PHOTO_BYTES", str(8 * 1024 * 1024)))  # 单张 8MB
MAX_TOTAL_BYTES = int(os.getenv("LOVE_MAX_TOTAL_BYTES", str(80 * 1024 * 1024)))  # 单次 80MB
UPLOADS_PER_HOUR = int(os.getenv("LOVE_UPLOADS_PER_HOUR", "20"))  # 单 IP 每小时次数

# 服务端二次压缩参数：前端已经压过一次，这里只是兜底 + 彻底洗掉 EXIF/GPS
IMAGE_MAX_SIDE = int(os.getenv("LOVE_IMAGE_MAX_SIDE", "1600"))
IMAGE_QUALITY = int(os.getenv("LOVE_IMAGE_QUALITY", "82"))

# 存 IP 前先加盐哈希，只用于限流/溯源，不落原始 IP
IP_SALT = os.getenv("LOVE_IP_SALT", "please-change-me")

MAX_PAYLOAD_JSON_BYTES = 64 * 1024


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
