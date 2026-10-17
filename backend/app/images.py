"""图片处理：校验 → 转正 → 压缩 → 洗掉一切元数据 → 落盘。"""

import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

# 解压炸弹护栏：一张 30000×30000 的 PNG 解出来是 2.7GB，必须先拦住
Image.MAX_IMAGE_PIXELS = 40_000_000


class ImageRejected(Exception):
    """这张图我们不接受（会以 400 返回给前端，并带上第几张）"""


def process(raw: bytes, dest_dir: Path, max_side: int, quality: int) -> dict:
    """
    处理一张图，返回 {file, width, height}。

    为什么要在服务端再压一遍（前端明明已经压过了）：
      1. 前端压缩可以被绕过（直接打接口），必须服务端兜底
      2. 手机原图里可能带 GPS / 设备型号 / 拍摄时间 —— 这是别人的隐私，
         重画到一张干净画布再存，EXIF 一个字节都不会留
      3. 顺便统一成 JPEG，避免 HEIC/AVIF 之类的兼容问题
    """
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            # 按 EXIF 把照片摆正（iPhone 竖拍的照片像素其实是横的）
            im = ImageOps.exif_transpose(im)

            # 带透明通道的（PNG/WebP）铺一层暖白，否则转 JPEG 会变黑
            if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                im = im.convert("RGBA")
                canvas = Image.new("RGB", im.size, (255, 250, 247))
                canvas.paste(im, mask=im.split()[-1])
                im = canvas
            else:
                im = im.convert("RGB")

            # 长边压到 max_side（前端已压过，这一步通常不触发）
            im.thumbnail((max_side, max_side), Image.LANCZOS)

            # 关键：画到一张全新画布，原图的所有 info/EXIF/ICC 都不会跟过来
            clean = Image.new("RGB", im.size)
            clean.paste(im, (0, 0))

            name = f"{uuid.uuid4().hex}.jpg"
            clean.save(dest_dir / name, "JPEG", quality=quality, optimize=True, progressive=True)
            return {"file": name, "width": clean.width, "height": clean.height}

    except UnidentifiedImageError as exc:
        raise ImageRejected("不是有效的图片文件") from exc
    except Image.DecompressionBombError as exc:
        raise ImageRejected("图片分辨率过大") from exc
    except OSError as exc:
        raise ImageRejected("图片损坏或格式不支持") from exc
    except Exception as exc:  # noqa: BLE001 —— 任何意外都当成「这张图不能用」，不能把 500 抛给前端
        raise ImageRejected("图片处理失败") from exc
