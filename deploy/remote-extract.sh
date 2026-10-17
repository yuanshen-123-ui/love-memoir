#!/usr/bin/env bash
# ============================================================================
#  服务器端解包脚本（由 deploy.ps1 上传并执行，不在本地跑）
#  用法：bash remote-extract.sh [目标目录] [tarball 路径]
# ============================================================================
set -euo pipefail

TARGET="${1:-/var/www/love.ccflysim.cn}"
TARBALL="${2:-/tmp/love-dist.tgz}"

if [ ! -f "$TARBALL" ]; then
  echo "找不到 tarball: $TARBALL" >&2
  exit 1
fi

mkdir -p "$TARGET"

# 只清掉本次会整体替换的两样东西；同目录下别的文件一律不动
rm -rf "${TARGET:?}/assets" "${TARGET:?}/index.html"

tar xzf "$TARBALL" -C "$TARGET"
chown -R www-data:www-data "$TARGET"
chmod -R a+rX "$TARGET"

echo "deployed -> $TARGET"
echo "--- 目录 ---"
ls -la "$TARGET"
echo "--- assets ---"
ls -la "$TARGET/assets"

# 纯静态站，换完文件立即生效，不需要 reload nginx
