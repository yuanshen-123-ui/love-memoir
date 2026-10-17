"""
测试前先把数据目录指到临时目录 —— 绝不能让 pytest 写进真实的 data/。
"""

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="love-memoir-test-"))

os.environ.setdefault("LOVE_DATA_DIR", str(_TMP / "data"))
os.environ.setdefault("LOVE_STATIC_DIR", str(_TMP / "static"))
os.environ.setdefault("LOVE_PUBLIC_BASE_URL", "https://test.local")
os.environ.setdefault("LOVE_UPLOADS_PER_HOUR", "1000")
