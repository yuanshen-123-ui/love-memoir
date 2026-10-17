#!/usr/bin/env bash
# ============================================================================
#  线上核验 + 清理测试数据（人工执行一次）
# ============================================================================
set -uo pipefail

APP_DIR=/opt/love-memoir-api
cd "$APP_DIR"

echo "== 1 数据库现状 =="
sqlite3 -header -column data/albums.db "select id, views, created_at, json_extract(payload,'\$.title') as title from albums order by created_at;" || true
echo "图片文件数: $(find static/uploads -name '*.jpg' -type f | wc -l)"

echo
echo "== 2 取一张图看响应头 =="
FIRST_DIR=$(find static/uploads -mindepth 1 -maxdepth 1 -type d | head -1)
if [ -n "$FIRST_DIR" ]; then
  FIRST_IMG=$(find "$FIRST_DIR" -name '*.jpg' -type f | head -1)
  REL=${FIRST_IMG#static/uploads/}
  echo "测试地址: /static/uploads/$REL"
  curl -sI "https://love.ccflysim.cn/static/uploads/$REL" | grep -iE "^HTTP/|cache-control|content-type|content-length"
fi

echo
echo "== 3 接口与首页头 =="
echo -n "api/health: "; curl -sS --max-time 8 https://love.ccflysim.cn/api/health; echo
curl -sI https://love.ccflysim.cn/ | grep -iE "^HTTP/|cache-control|content-security-policy" | head -3
echo -n "未知 album 404: "; curl -s -o /dev/null -w '%{http_code}\n' https://love.ccflysim.cn/api/album/notARealAlbumId
echo -n "非法 id 404: "; curl -s -o /dev/null -w '%{http_code}\n' "https://love.ccflysim.cn/api/album/..%2F..%2Fetc%2Fpasswd"
echo -n "超量上传(21张)应 400: "; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://love.ccflysim.cn/api/upload -F 'payload={"title":"x"}' $(for i in $(seq 1 21); do echo -n "-F photos=@static/uploads/$(find static/uploads -name '*.jpg' | head -1) "; done) 2>/dev/null

echo
echo "== 4 清理 E2E 造的测试回忆录 =="
DELETE_IDS=$(sqlite3 data/albums.db "select id from albums where json_extract(payload,'\$.title')='我们的第一次旅行';")
if [ -n "$DELETE_IDS" ]; then
  for id in $DELETE_IDS; do
    echo "  删除 $id"
    rm -rf "static/uploads/$id"
  done
  sqlite3 data/albums.db "delete from albums where json_extract(payload,'\$.title')='我们的第一次旅行';"
else
  echo "  没有需要清理的测试数据"
fi
echo "剩余: $(sqlite3 data/albums.db 'select count(*) from albums;') 条 / $(find static/uploads -name '*.jpg' -type f | wc -l) 张图"

echo
echo "== 5 nginx 反代段 =="
grep -c "love-memoir api" /etc/nginx/sites-available/love.ccflysim.cn
systemctl is-active love-memoir-api
echo
echo VERIFY_DONE
