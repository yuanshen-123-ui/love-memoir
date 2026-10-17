"""album_id 生成。

用 secrets（密码学安全随机）而不是 uuid4：
  · 12 个 URL 安全字符，62^12 ≈ 3.2e21，猜不到别人的回忆录
  · 不用 uuid4 是因为它虽然也够随机，但长度 36 且带横杠，链接会难看
"""

import re
import secrets

ALPHABET_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def new_album_id(nbytes: int = 9) -> str:
    """9 字节 → 12 个 URL 安全字符，例如 `Zm9vYmFy_-xQ`"""
    return secrets.token_urlsafe(nbytes)


def is_valid_album_id(value: str) -> bool:
    """只做格式校验：长度 + 字符集。防止把 ../ 之类的东西拼进文件路径"""
    return bool(value) and 8 <= len(value) <= 32 and bool(ALPHABET_RE.match(value))
