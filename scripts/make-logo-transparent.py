from PIL import Image

src = r"public/logo.png"
img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

THRESHOLD = 28
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r <= THRESHOLD and g <= THRESHOLD and b <= THRESHOLD:
            pixels[x, y] = (0, 0, 0, 0)
            continue
        # Soft navy/cyan glow around the mark reads as a card — fade or remove it
        if r <= 40 and g <= 50 and b <= 70 and max(r, g, b) < 80:
            if b > r + 8 and g > r:
                alpha = min(a, int(max(0, (max(r, g, b) - 20) * 4)))
                pixels[x, y] = (r, g, b, alpha)
            else:
                pixels[x, y] = (0, 0, 0, 0)

bbox = img.getbbox()
if bbox:
    pad = 8
    l, t, r, b = bbox
    cropped = img.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
else:
    cropped = img

cropped.save(r"public/logo.png")
print("logo.png", cropped.size)

cw, ch = cropped.size
pix = cropped.load()
alphas = []
for y in range(ch):
    alphas.append(sum(1 for x in range(cw) if pix[x, y][3] > 20))

mid_start = int(ch * 0.35)
mid_end = int(ch * 0.75)
best = None
y = mid_start
while y < mid_end:
    if alphas[y] < cw * 0.02:
        start = y
        while y < mid_end and alphas[y] < cw * 0.02:
            y += 1
        gap = y - start
        if best is None or gap > best[0]:
            best = (gap, start, y)
    else:
        y += 1

if best and best[0] >= 4:
    icon = cropped.crop((0, 0, cw, best[1] + 4))
else:
    icon = cropped.crop((0, 0, cw, int(ch * 0.58)))

bb = icon.getbbox()
if bb:
    icon = icon.crop(bb)
icon.save(r"public/logo-mark.png")
print("logo-mark.png", icon.size)
print("done")
