#!/usr/bin/env bash
# 验证 nginx 的 client_max_body_size 确实放开了：5MB 单张（后端上限 8MB）应该 201
set -uo pipefail
cd /opt/love-memoir-api
BASE=https://love.ccflysim.cn

.venv/bin/python - <<'PYEOF'
from PIL import Image, ImageFilter
import os
img = Image.effect_noise((1600, 2200), 90).convert('RGB').filter(ImageFilter.GaussianBlur(0.4))
img.save('/tmp/t-5m.jpg', 'JPEG', quality=72)
print('5MB 测试图大小:', round(os.path.getsize('/tmp/t-5m.jpg') / 1024 / 1024, 2), 'MB')
PYEOF

echo -n "5MB 单张上传 -> "
RESP=$(curl -sS --max-time 120 -w '\n%{http_code}' -X POST "$BASE/api/upload" \
  -F 'payload={"title":"大小测试"}' -F 'photos=@/tmp/t-5m.jpg')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
echo "$CODE"
echo "  响应: $(echo "$BODY" | head -c 120)"

AID=$(echo "$BODY" | sed -n 's/.*"album_id":"\([^"]*\)".*/\1/p')
if [ -n "$AID" ]; then
  echo "  取回: $(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/album/$AID")"
  rm -rf "static/uploads/$AID"
  sqlite3 data/albums.db "delete from albums where id='$AID';"
fi
rm -f /tmp/t-5m.jpg
echo "清理后: $(sqlite3 data/albums.db 'select count(*) from albums;') 条 / $(find static/uploads -name '*.jpg' -type f | wc -l) 张图"
echo BIG_DONE
