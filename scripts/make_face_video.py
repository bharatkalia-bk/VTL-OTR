"""Builds the fake-camera fixture for Playwright (Chromium --use-file-for-fake-video-capture).

Source: NASA portrait of astronaut Eileen Collins (public domain; distributed with scikit-image as
`astronaut.png`). The clip holds the face still, then simulates a slight head turn with a perspective
warp and returns, so the in-browser liveness (HEAD_TURN) check can pass. Output: 640x480 Y4M, 15 fps.
Usage: python3 scripts/make_face_video.py <astronaut.png> <out.y4m>
"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
W, H, FPS = 640, 480, 15
face = Image.open(src).convert('RGB')
# crop around the head and shoulders, place on a plain light background
crop = face.crop((96, 0, 352, 300)).resize((360, 422), Image.LANCZOS)
bg = Image.new('RGB', (W, H), (226, 228, 232))

NOSE_X = (225 - 96) / 256  # nose position as a fraction of the crop width

def frame(turn: float) -> Image.Image:
    """Approximate a head turn: squeeze the half of the face right of the nose by k (k=1 neutral).
    The yaw proxy used in the app, (nose - eye midpoint) / eye distance, becomes ~ (1-k) / (2(1+k))."""
    w, h = crop.size
    k = 1 - 0.55 * turn
    src = np.asarray(crop)
    nx = int(NOSE_X * w)
    xs = np.arange(w)
    # inverse map for output x > nx: source = nx + (x - nx) / k; beyond the face edge use background
    srcx = np.where(xs <= nx, xs, nx + (xs - nx) / k)
    valid = srcx < w
    srcx = np.clip(srcx, 0, w - 1).astype(int)
    out = src[:, srcx, :].copy()
    out[:, ~valid, :] = (226, 228, 232)
    img = bg.copy()
    img.paste(Image.fromarray(out), ((W - w) // 2, (H - h) // 2 + 10))
    return img

seq = [0.0] * 30 + [i / 8 for i in range(9)] + [1.0] * 22 + [1 - i / 8 for i in range(9)] + [0.0] * 20
with open(out, 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
    for t in seq:
        ycbcr = np.asarray(frame(t).convert('YCbCr'))
        y = ycbcr[:, :, 0]
        cb = ycbcr[::2, ::2, 1]; cr = ycbcr[::2, ::2, 2]
        f.write(b'FRAME\n'); f.write(y.tobytes()); f.write(cb.tobytes()); f.write(cr.tobytes())
print('wrote', out, len(seq), 'frames')
