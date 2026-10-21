"""生成 PWA 图标（与 public/favicon.svg 同一品牌标）。

- icon-{192,512}.png        圆角方块（purpose: any）
- icon-maskable-{192,512}.png  全出血 + 字形收进 60% 安全区（purpose: maskable）
- apple-touch-icon.png      180 全出血（iOS 不支持 svg 图标）

品牌标构成（32 视口等比）：
  圆角方块 #0E7490（--teal-600, accent）
  白色三条递宽横条（复习队列）+ 右下圆点（下一张卡）
"""
from PIL import Image, ImageDraw

TEAL = (14, 116, 144, 255)      # #0E7490  --teal-600 / --color-accent
WHITE = (255, 255, 255, 255)

S = 1024  # 超采样基准，输出时降采样抗锯齿


def draw_tile(size: int, maskable: bool, apple: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or apple:
        d.rectangle([0, 0, size, size], fill=TEAL)          # 全出血
    else:
        r = round(size * 0.219)                              # rx=7/32
        d.rounded_rectangle([0, 0, size, size], radius=r, fill=TEAL)

    # 字形中心 + 缩放：maskable 收进 60% 安全区；普通图标约 76%
    scale = 0.60 if maskable else (0.72 if apple else 0.76)
    k = size * scale / 32.0
    ox, oy = (size - 32 * k) / 2, (size - 32 * k) / 2

    def box(x, y, w, h):
        return [ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k]

    bar_h = 3 * k
    rr = max(1, round(1.5 * k))
    d.rounded_rectangle(box(7, 8, 18, 3), radius=rr, fill=WHITE)
    d.rounded_rectangle(box(7, 13, 13, 3), radius=rr, fill=WHITE)
    d.rounded_rectangle(box(7, 18, 9, 3), radius=rr, fill=WHITE)
    r_dot = 2 * k
    cx, cy = ox + 22.5 * k, oy + 24 * k
    d.ellipse([cx - r_dot, cy - r_dot, cx + r_dot, cy + r_dot], fill=WHITE)
    return img


def save(img: Image.Image, path: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(f"wrote {path} ({size}x{size})")


base = draw_tile(S, maskable=False)
mask = draw_tile(S, maskable=True)
apple_img = draw_tile(S, maskable=True, apple=True)

out = "C:/Users/dason/WorkBuddy/2026-10-20-23-55-08/examflow-vocab/public"
save(base, f"{out}/icon-192.png", 192)
save(base, f"{out}/icon-512.png", 512)
save(mask, f"{out}/icon-maskable-192.png", 192)
save(mask, f"{out}/icon-maskable-512.png", 512)
save(apple_img, f"{out}/apple-touch-icon.png", 180)
