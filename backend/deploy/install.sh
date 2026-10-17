#!/usr/bin/env bash
# ============================================================================
#  在服务器上安装 / 升级 love-memoir 后端（幂等，可以反复跑）
#  由 deploy-backend.ps1 上传代码后执行：bash /tmp/love-api-install.sh /tmp/love-api.tgz
#
#  注意：本文件刻意**不用任何反斜杠续行**。
#  在 Windows 上编辑过的 shell 脚本，续行符后面混进一个 \r 就会让整条命令散架，
#  之前那次 "pip: You must give at least one requirement" 就是这么来的。
# ============================================================================
set -euo pipefail

# 单实例锁：绝不允许两个安装进程同时跑（会互相 rm -rf 对方的 .venv，之前就被这个坑过）
exec 9>/tmp/love-api-install.lock
if ! flock -n 9; then
  echo "已有另一个安装进程在跑，退出" >&2
  exit 1
fi

APP_DIR=/opt/love-memoir-api
TARBALL="${1:-/tmp/love-api.tgz}"
DIST_TARBALL="${2:-}"
CONF=/etc/nginx/sites-available/love.ccflysim.cn
SERVICE=love-memoir-api
PY="$APP_DIR/.venv/bin/python"
PIP="$APP_DIR/.venv/bin/pip"

echo "== 1/7 解包代码 =="
if [ ! -f "$TARBALL" ]; then
  echo "找不到 $TARBALL" >&2
  exit 1
fi
mkdir -p "$APP_DIR"
tar xzf "$TARBALL" -C "$APP_DIR"
mkdir -p "$APP_DIR/data" "$APP_DIR/static/uploads"
sed -i 's/\r$//' "$APP_DIR/deploy/"* 2>/dev/null || true

echo "== 2/7 准备 venv 与依赖 =="
if [ -x "$PY" ] && "$PY" -c 'import fastapi, uvicorn, PIL, multipart' 2>/dev/null; then
  echo "依赖已就绪，跳过安装"
else
  echo "重建 venv（上一次可能装到一半被打断了）"
  rm -rf "$APP_DIR/.venv"
  python3 -m venv "$APP_DIR/.venv"
  # 服务器在国内，官方源经常只有几十 KB/s；先走阿里云镜像，失败再回退官方源
  MIRROR="${LOVE_PIP_MIRROR:-https://mirrors.aliyun.com/pypi/simple/}"
  echo "用镜像安装：$MIRROR"
  if ! "$PIP" install --disable-pip-version-check --no-cache-dir -i "$MIRROR" --trusted-host mirrors.aliyun.com -r "$APP_DIR/requirements.txt"; then
    echo "镜像失败，回退官方源" >&2
    "$PIP" install --disable-pip-version-check --no-cache-dir -r "$APP_DIR/requirements.txt"
  fi
  "$PY" -c 'import fastapi, uvicorn, PIL, multipart; print("依赖装好了")'
fi

echo "== 3/7 生成 .env（只在第一次）=="
if [ ! -f "$APP_DIR/.env" ]; then
  SALT="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  sed -i "s|^LOVE_IP_SALT=.*|LOVE_IP_SALT=$SALT|" "$APP_DIR/.env"
  echo "已生成 .env（IP 盐值随机）"
else
  echo ".env 已存在，保留"
fi

echo "== 4/7 目录权限 =="
chown -R www-data:www-data "$APP_DIR/data" "$APP_DIR/static"
chmod -R a+rX "$APP_DIR"
chown root:root "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo "== 5/7 systemd =="
install -m 644 "$APP_DIR/deploy/love-memoir-api.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"
sleep 3
if ! systemctl is-active --quiet "$SERVICE"; then
  echo "服务没起来，最近日志：" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
  exit 1
fi
echo "服务运行中"

echo "== 6/7 nginx 反代 =="
"$PY" "$APP_DIR/deploy/patch-nginx.py"
nginx -t
systemctl reload nginx

echo "== 7/7 自检 =="
LOCAL_JSON="$(curl -sS --max-time 8 http://127.0.0.1:8010/api/health || echo '')"
echo "本机 uvicorn: ${LOCAL_JSON:0:120}"
PUBLIC_JSON="$(curl -sS --max-time 10 https://love.ccflysim.cn/api/health || echo '')"
echo "经 nginx:    ${PUBLIC_JSON:0:120}"
case "$PUBLIC_JSON" in
  *'"ok":true'*) echo "OK 后端已就绪" ;;
  *) echo "FAIL 经 nginx 访问 /api/health 不正常" >&2; exit 1 ;;
esac

echo "DONE 数据目录：$APP_DIR/data   图片目录：$APP_DIR/static/uploads"

# ---------------------------------------------------------------- 顺便发布前端
# 传了第二个参数（dist 的 tar 包）就一起换掉静态站，省一次单独的部署窗口
if [ -n "$DIST_TARBALL" ] && [ -f "$DIST_TARBALL" ]; then
  echo "== 附加：更新前端静态站 =="
  WEB_ROOT=/var/www/love.ccflysim.cn
  mkdir -p "$WEB_ROOT"
  rm -rf "$WEB_ROOT/assets" "$WEB_ROOT/index.html"
  tar xzf "$DIST_TARBALL" -C "$WEB_ROOT"
  chown -R www-data:www-data "$WEB_ROOT"
  chmod -R a+rX "$WEB_ROOT"
  echo "前端已更新：$(ls "$WEB_ROOT" | tr '\n' ' ')"
  # 静态站不需要 reload nginx，但换一下也无害（保证 mime/缓存头生效）
  systemctl reload nginx
  echo "ALLDONE 前后端都已更新"
fi
