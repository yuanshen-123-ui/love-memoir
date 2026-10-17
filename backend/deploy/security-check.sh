#!/usr/bin/env bash
# ============================================================================
#  线上接口的安全/限额核验（在服务器上跑，用真实 HTTPS 打自己）
#  会临时造一条回忆录，跑完自己删掉
# ============================================================================
set -uo pipefail

APP_DIR=/opt/love-memoir-api
cd "$APP_DIR"
BASE=https://love.ccflysim.cn
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PY=.venv/bin/python

# 造测试图：一张正常小图、一张 6MB 大图、一个假图片
"$PY" - <<'PYEOF'
from PIL import Image
import os
Image.new('RGB', (900, 1200), (210, 160, 180)).save('/tmp/t-small.jpg', 'JPEG', quality=85)
# 6MB 左右：大尺寸 + 低压缩
img = Image.effect_noise((2400, 3200), 60).convert('RGB')
img.save('/tmp/t-big.jpg', 'JPEG', quality=100)
with open('/tmp/t-fake.jpg', 'wb') as f:
    f.write(b'not an image at all, just bytes' * 100)
print('sizes:', os.path.getsize('/tmp/t-small.jpg'), os.path.getsize('/tmp/t-big.jpg'))
PYEOF

post() { curl -sS -o /dev/null -w '%{http_code}' --max-time 120 "$@"; }

echo "== 1 单张 6MB 大图（验证 nginx 的 client_max_body_size 生效）=="
BIG_CODE=$(post -X POST "$BASE/api/upload" -F 'payload={"title":"限额测试"}' -F "photos=@/tmp/t-big.jpg")
echo "  6MB 上传 -> $BIG_CODE（期望 201；若是 413 说明 nginx 体积上限没放开）"

echo "== 2 非图片 -> 期望 400 =="
echo "  假图片 -> $(post -X POST "$BASE/api/upload" -F 'payload={"title":"x"}' -F 'photos=@/tmp/t-fake.jpg')"

echo "== 3 payload 非法 JSON -> 期望 422 =="
echo "  -> $(post -X POST "$BASE/api/upload" -F 'payload={not json' -F 'photos=@/tmp/t-small.jpg')"

echo "== 4 标题超长（31 字）-> 期望 422 =="
LONG=$(printf 'a%.0s' $(seq 1 31))
echo "  -> $(post -X POST "$BASE/api/upload" -F "payload={\"title\":\"$LONG\"}" -F 'photos=@/tmp/t-small.jpg')"

echo "== 5 21 张照片 -> 期望 400 =="
ARGS=()
for i in $(seq 1 21); do ARGS+=(-F "photos=@/tmp/t-small.jpg"); done
echo "  -> $(post -X POST "$BASE/api/upload" -F 'payload={"title":"x"}' "${ARGS[@]}")"

echo "== 6 正常上传 2 张 -> 期望 201，并取回 =="
RESP=$(curl -sS --max-time 60 -X POST "$BASE/api/upload" -F 'payload={"title":"限额测试","captions":["一","二"]}' -F 'photos=@/tmp/t-small.jpg' -F 'photos=@/tmp/t-small.jpg')
echo "  $RESP" | head -c 200; echo
AID=$(echo "$RESP" | sed -n 's/.*"album_id":"\([^"]*\)".*/\1/p')
if [ -n "$AID" ]; then
  echo "  GET /api/album/$AID -> $(post "$BASE/api/album/$AID")"
  IMG=$(echo "$RESP" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
  echo "  图片 $IMG -> $(post "$IMG")"
fi

echo "== 7 清理（把刚才造的测试数据删掉）=="
for id in $AID $(sqlite3 data/albums.db "select id from albums where json_extract(payload,'\$.title')='限额测试';"); do
  [ -n "$id" ] || continue
  rm -rf "static/uploads/$id"
done
sqlite3 data/albums.db "delete from albums where json_extract(payload,'\$.title')='限额测试';"
sqlite3 data/albums.db "delete from albums where json_extract(payload,'\$.title')='x';"
echo "  剩余 $(sqlite3 data/albums.db 'select count(*) from albums;') 条 / $(find static/uploads -name '*.jpg' -type f | wc -l) 张图"
echo SECURITY_DONE
