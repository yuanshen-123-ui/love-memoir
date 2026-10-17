#!/usr/bin/env bash
# ============================================================================
#  收尾脚本：依赖已经装好，这里只做 .env / 权限 / systemd / nginx / 前端发布
#  （install.sh 被 SSH 掐断后用它补齐，和 install.sh 的 3~7 步等价）
# ============================================================================
set -euo pipefail

APP_DIR=/opt/love-memoir-api
cd "$APP_DIR"

echo "== 1 依赖自检 =="
.venv/bin/python -c 'import fastapi, uvicorn, PIL, multipart; print("  imports ok")'

echo "== 2 .env =="
if [ ! -f .env ]; then
  SALT=$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
  cp .env.example .env
  sed -i "s|^LOVE_IP_SALT=.*|LOVE_IP_SALT=$SALT|" .env
  echo "  已生成 .env"
else
  echo "  .env 已存在"
fi
chmod 600 .env

echo "== 3 权限 =="
mkdir -p data static/uploads
chown -R www-data:www-data data static
chmod -R a+rX .
chown root:root .env
chmod 600 .env

echo "== 4 systemd =="
sed -i 's/\r$//' deploy/love-memoir-api.service
install -m 644 deploy/love-memoir-api.service /etc/systemd/system/love-memoir-api.service
systemctl daemon-reload
systemctl enable love-memoir-api >/dev/null 2>&1 || true
systemctl restart love-memoir-api
sleep 3
systemctl is-active love-memoir-api

echo "== 5 nginx 反代 =="
.venv/bin/python deploy/patch-nginx.py
nginx -t
systemctl reload nginx

echo "== 6 本机健康检查 =="
curl -sS --max-time 8 http://127.0.0.1:8010/api/health
echo

echo "== 7 发布前端 =="
if [ -f /tmp/love-dist.tgz ]; then
  WEB_ROOT=/var/www/love.ccflysim.cn
  mkdir -p "$WEB_ROOT"
  rm -rf "$WEB_ROOT/assets" "$WEB_ROOT/index.html"
  tar xzf /tmp/love-dist.tgz -C "$WEB_ROOT"
  chown -R www-data:www-data "$WEB_ROOT"
  chmod -R a+rX "$WEB_ROOT"
  echo "  前端文件：$(ls "$WEB_ROOT" | tr '\n' ' ')"
fi

echo "== 8 经 nginx 健康检查 =="
curl -sS --max-time 10 https://love.ccflysim.cn/api/health
echo
echo ALLDONE
