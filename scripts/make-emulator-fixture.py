"""Build synthetic Android-emulator recording for MotionDeck E2E validation."""

from pathlib import Path
import subprocess
import shutil
import tempfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FPS = 30
DURATION_S = 6
N_FRAMES = FPS * DURATION_S


def draw_frame(t: float) -> Image.Image:
    """t in seconds. Emulates slight window drift + tap highlights."""
    img = Image.new("RGB", (W, H), (28, 32, 40))
    draw = ImageDraw.Draw(img)

    for i in range(4):
        x = 40 + i * 70
        draw.rounded_rectangle((x, 40, x + 48, 88), radius=8, fill=(55, 62, 74))

    # Subtle emulator window drift (pixels) — exercises crop tracking
    drift_x = int(round(6 * (t / DURATION_S)))
    drift_y = int(round(4 * ((t % 2.0) / 2.0)))

    win = (420 + drift_x, 40 + drift_y, 860 + drift_x, 680 + drift_y)
    draw.rounded_rectangle(win, radius=12, fill=(18, 20, 24), outline=(70, 76, 88), width=2)
    draw.rectangle((win[0], win[1], win[2], win[1] + 28), fill=(32, 36, 44))
    draw.text((win[0] + 12, win[1] + 6), "Android Emulator - Pixel_7_API_34", fill=(160, 168, 180))

    phone = (470 + drift_x, 90 + drift_y, 810 + drift_x, 650 + drift_y)
    draw.rounded_rectangle(phone, radius=36, fill=(10, 10, 12), outline=(90, 95, 105), width=3)

    screen = (492 + drift_x, 118 + drift_y, 788 + drift_x, 610 + drift_y)
    draw.rounded_rectangle(screen, radius=18, fill=(245, 247, 250))

    # App chrome
    draw.rectangle((screen[0], screen[1], screen[2], screen[1] + 50), fill=(34, 211, 238))
    draw.text((screen[0] + 18, screen[1] + 14), "MotionDeck Demo", fill=(8, 12, 16))

    # Scroll offset for "navigation"
    scroll = int(40 * min(1.0, max(0.0, (t - 2.0) / 2.0))) if t >= 2.0 else 0

    buttons = [
        ("Login", 200 - scroll, (226, 232, 240), (30, 41, 59)),
        ("Add Listing", 290 - scroll, (226, 232, 240), (30, 41, 59)),
        ("Checkout", 380 - scroll, (15, 23, 42), (248, 250, 252)),
        ("Profile", 470 - scroll, (226, 232, 240), (30, 41, 59)),
    ]
    for label, y_off, bg, fg in buttons:
        y0 = screen[1] + y_off
        y1 = y0 + 60
        if y1 < screen[1] + 50 or y0 > screen[3] - 10:
            continue
        box = (screen[0] + 28, y0, screen[2] - 28, y1)
        draw.rounded_rectangle(box, radius=12, fill=bg)
        draw.text((box[0] + 20, y0 + 20), label, fill=fg)

    # Tap ripple moments at Login (~1.0s) and Checkout (~3.5s)
    taps = [(1.0, 0.5, 230), (3.5, 0.5, 410 - scroll)]
    for tap_t, dur, y_rel in taps:
        age = t - tap_t
        if 0 <= age <= dur:
            cx = (screen[0] + screen[2]) // 2
            cy = screen[1] + y_rel + 30
            r = int(12 + age * 40)
            alpha = max(0, int(180 * (1 - age / dur)))
            overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            od.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(34, 211, 238, alpha), width=3)
            img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
            draw = ImageDraw.Draw(img)

    # Emulator side toolbar
    draw.rectangle((870 + drift_x, 120 + drift_y, 910 + drift_x, 400 + drift_y), fill=(22, 24, 28))
    for y in (140, 190, 240, 290):
        draw.ellipse((880 + drift_x, y + drift_y, 900 + drift_x, y + 20 + drift_y), fill=(80, 86, 98))

    return img


def main() -> None:
    still = draw_frame(0.0)
    still_path = OUT / "emulator-app-screen.png"
    still.save(still_path)
    print("wrote", still_path)

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found; PNG only")
        return

    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        for i in range(N_FRAMES):
            t = i / FPS
            frame = draw_frame(t)
            frame.save(tdir / f"frame_{i:04d}.png")

        mp4 = OUT / "emulator-recording.mp4"
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            str(tdir / "frame_%04d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            str(mp4),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print("wrote", mp4, "frames=", N_FRAMES)


if __name__ == "__main__":
    main()
