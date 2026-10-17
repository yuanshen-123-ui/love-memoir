#!/usr/bin/env python3
"""
把 /api/ 与 /static/uploads/ 两个 location 塞进 nginx 的站点配置。

为什么要写脚本而不是手动改：
  服务器上的配置是上次部署留下的，人工改容易改错、也容易忘；
  脚本是幂等的（已经有就不动），每次部署跑一遍，结果都一样。

插入位置：第一个 `location /assets/ {` 之前（这个块只在 443 里出现，
不会误插到 80 端口那个 return 301 的 server 里）。
"""

import re
import sys
from pathlib import Path

CONF = Path("/etc/nginx/sites-available/love.ccflysim.cn")
MARKER = "# >>> love-memoir api (由 backend/deploy/patch-nginx.py 维护)"

BLOCK = f"""
    {MARKER}
    # ------------------------------------------------------------------------
    #  回忆录后端（FastAPI，只监听 127.0.0.1:8010，公网只能经 nginx 进来）
    #  · 上传要收最多 20 张照片，所以单独放开体积上限（默认 64k 会直接 413）
    #  · 20 张图服务端要逐张解码压缩，读超时给到 120s
    # ------------------------------------------------------------------------
    location /api/ {{
        client_max_body_size 96m;
        proxy_pass http://127.0.0.1:8010;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        # 接口响应不缓存
        add_header Cache-Control "no-store" always;
    }}

    # 用户上传的照片：文件名是 uuid，内容永不变 → 交给 nginx 直接读盘（比走 Python 快）
    location /static/uploads/ {{
        alias /opt/love-memoir-api/static/uploads/;
        try_files $uri =404;
        add_header Cache-Control "public, max-age=2592000" always;
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }}
    # <<< love-memoir api

"""


def main() -> int:
    if not CONF.exists():
        print(f"找不到 {CONF}", file=sys.stderr)
        return 1

    text = CONF.read_text(encoding="utf-8")
    if MARKER in text:
        print("nginx 配置里已经有 api 段，跳过")
        return 0

    anchor = re.search(r"^[ \t]*location /assets/ \{", text, re.MULTILINE)
    if not anchor:
        print("找不到插入锚点 location /assets/", file=sys.stderr)
        return 1

    patched = text[: anchor.start()] + BLOCK + text[anchor.start() :]

    backup = CONF.with_suffix(f".conf.bak-{__import__('time').strftime('%Y%m%d%H%M%S')}")
    backup.write_text(text, encoding="utf-8")
    CONF.write_text(patched, encoding="utf-8")
    print(f"已插入 api 段（备份：{backup}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
