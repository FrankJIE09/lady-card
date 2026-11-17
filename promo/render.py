#!/usr/bin/env python3
"""Render the 15-second vertical promo from real UI captures and an original score."""

import argparse
import math
import os
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT, FPS, DURATION = 1080, 1920, 30, 15
PLUM = (39, 27, 46)
PAPER = (244, 237, 222)
GOLD = (209, 183, 129)
ROSE = (190, 117, 130)
SANS = "/System/Library/Fonts/STHeiti Medium.ttc"
SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT = {
    "brand": ImageFont.truetype(SERIF, 58),
    "title": ImageFont.truetype(SERIF, 86),
    "end": ImageFont.truetype(SERIF, 124),
    "body": ImageFont.truetype(SANS, 42),
    "small": ImageFont.truetype(SANS, 31),
    "url": ImageFont.truetype(SANS, 42),
}


def clamp(value):
    return max(0.0, min(1.0, value))


def ease(value):
    value = clamp(value)
    return value * value * (3 - 2 * value)


def base_image():
    y = np.linspace(0, 1, HEIGHT, dtype=np.float32)[:, None]
    x = np.linspace(0, 1, WIDTH, dtype=np.float32)[None, :]
    glow = np.maximum(0, 1 - np.abs(x - .50) * 1.3 - np.abs(y - .42) * .6)
    grain = (np.sin(np.arange(HEIGHT, dtype=np.float32)[:, None] * .43)
             * np.cos(np.arange(WIDTH, dtype=np.float32)[None, :] * .37)) * 1.5
    channels = [np.clip(c + (v - c) * y + 17 * glow + grain, 0, 255)
                for c, v in zip(PLUM, (31, 39, 43))]
    image = Image.fromarray(np.stack(np.broadcast_arrays(*channels), -1).astype("uint8"), "RGB")
    draw = ImageDraw.Draw(image)
    draw.line((54, 72, 1026, 72), fill=(125, 107, 98), width=2)
    draw.line((54, 1810, 1026, 1810), fill=(93, 105, 95), width=2)
    return image


BASE = base_image()
HOME = Image.open(ROOT / "source/home.png").convert("RGB")
GAME = Image.open(ROOT / "source/game.png").convert("RGB")
LATE = Image.open(ROOT / "source/late-join.png").convert("RGB")
SCREENS = {
    "home": HOME.resize((590, round(HOME.height * 590 / HOME.width)), Image.Resampling.LANCZOS),
    "game": GAME.resize((590, round(GAME.height * 590 / GAME.width)), Image.Resampling.LANCZOS),
    "late": LATE.resize((590, round(LATE.height * 590 / LATE.width)), Image.Resampling.LANCZOS),
}
CARD = GAME.crop((85, 311, 305, 636)).resize((460, 680), Image.Resampling.LANCZOS)
FAN = HOME.crop((0, 285, 390, 675)).resize((840, 840), Image.Resampling.LANCZOS)


def label(draw, text, x, y, font, fill, anchor="lt"):
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor, stroke_width=0)


def frame_header(image, number):
    draw = ImageDraw.Draw(image)
    label(draw, "♠ ♥", 74, 96, FONT["brand"], GOLD)
    label(draw, "今夜开牌", 245, 103, FONT["brand"], PAPER)
    label(draw, f"0{number} / 05", 1000, 112, FONT["small"], GOLD, "rt")
    draw.line((75, 171, 1005, 171), fill=(147, 120, 119), width=2)


def phone(image, which, y, scroll=0, x=225):
    screen = SCREENS[which]
    crop = screen.crop((0, int(scroll), 590, int(scroll) + 1260))
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 589, 1259), radius=36, fill=255)
    shadow = Image.new("RGBA", (650, 1320), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((25, 25, 625, 1295), radius=48, fill=(0, 0, 0, 125))
    image.paste(shadow.filter(ImageFilter.GaussianBlur(28)), (x - 30, y - 8), shadow.getchannel("A"))
    image.paste(crop, (x + 20, y + 18), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((x + 17, y + 15, x + 613, y + 1283), radius=42,
                           outline=GOLD, width=4)


def scene(index, t):
    image = BASE.copy()
    frame_header(image, index + 1)
    draw = ImageDraw.Draw(image)

    if index == 0:
        label(draw, "朋友到齐，", 92, 214, FONT["title"], PAPER)
        label(draw, "好戏开场。", 92, 317, FONT["title"], GOLD)
        phone(image, "home", 448 - round(15 * ease(t / 3)), scroll=8)
        label(ImageDraw.Draw(image), "一部手机，就能开一桌。", 540, 1785, FONT["body"], PAPER, "mm")
    elif index == 1:
        label(draw, "三种牌，三种开场。", 540, 262, FONT["title"], PAPER, "mt")
        zoom = 1 + .055 * ease(t / 3)
        size = round(840 * zoom)
        fan = FAN.resize((size, size), Image.Resampling.BICUBIC)
        mask = Image.new("L", fan.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=30, fill=255)
        image.paste(fan, ((WIDTH - size) // 2, 455), mask)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((93, 435, 987, 1350), radius=35, outline=GOLD, width=3)
        label(draw, "小姐牌  ·  大姐牌  ·  少爷牌", 540, 1458, FONT["body"], GOLD, "mt")
        label(draw, "选今晚的玩法，抽你们的故事。", 540, 1545, FONT["small"], PAPER, "mt")
    elif index == 2:
        label(draw, "抽一张，故事就开场。", 540, 257, FONT["title"], PAPER, "mt")
        phone(image, "game", 390, scroll=95 + 45 * ease(t / 4))
        if t < 1.25:
            turn = clamp(t / .8)
            width = max(3, round(460 * abs(math.cos(math.pi * turn))))
            card = CARD if turn >= .5 else Image.new("RGB", CARD.size, PLUM)
            if turn < .5:
                back = ImageDraw.Draw(card)
                back.rounded_rectangle((18, 18, 442, 662), radius=25, outline=GOLD, width=5)
                label(back, "今 夜 开 牌", 230, 310, FONT["brand"], GOLD, "mm")
            card = card.resize((width, 680), Image.Resampling.BICUBIC)
            overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
            overlay.paste(card, ((WIDTH - width) // 2, 645))
            opacity = 1 - ease((t - .87) / .38)
            overlay.putalpha(overlay.getchannel("A").point(lambda value: round(value * opacity)))
            image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        label(ImageDraw.Draw(image), "翻开这一张，轮到下一个朋友。", 540, 1780, FONT["body"], GOLD, "mm")
    elif index == 3:
        label(draw, "迟到的朋友，", 94, 218, FONT["title"], PAPER)
        label(draw, "现在也能入座。", 94, 324, FONT["title"], GOLD)
        phone(image, "late", 445, scroll=500 + 420 * ease(t / 3))
        label(ImageDraw.Draw(image), "开局后加入 · 进度继续保留", 540, 1780, FONT["body"], PAPER, "mm")
    else:
        label(draw, "今夜开牌", 540, 270, FONT["end"], PAPER, "mt")
        label(draw, "小姐牌 · 大姐牌 · 少爷牌", 540, 442, FONT["body"], GOLD, "mt")
        fan = FAN.resize((780, 780), Image.Resampling.BICUBIC)
        mask = Image.new("L", fan.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 779, 779), radius=32, fill=255)
        image.paste(fan, (150, 555), mask)
        draw = ImageDraw.Draw(image)
        label(draw, "手机打开，拉朋友开局。", 540, 1390, FONT["body"], PAPER, "mt")
        draw.rounded_rectangle((85, 1490, 995, 1604), radius=16, fill=(223, 199, 153))
        label(draw, "frankjie09.github.io/lady-card/", 540, 1548, FONT["url"], PLUM, "mm")
    return image


BEATS = [0, 3, 6, 10, 13, 15]


def frame_at(second):
    index = max(0, min(4, next((i for i in range(5) if second < BEATS[i + 1]), 4)))
    return scene(index, second - BEATS[index])


def write_score(path):
    rate = 48000
    count = DURATION * rate
    mix = np.zeros(count, dtype=np.float64)
    rng = np.random.default_rng(2026)
    chords = [[60, 64, 67, 71, 74], [57, 60, 64, 67, 71],
              [53, 57, 60, 64, 67], [55, 59, 62, 65, 69]]
    melody = [76, 0, 74, 0, 71, 0, 0, 74, 72, 0, 0, 71, 0, 67, 0, 0,
              69, 0, 72, 0, 76, 0, 0, 74, 71, 0, 69, 0, 67, 0, 0, 0]

    def note(start, length, midi, volume, decay=2.0):
        if not midi:
            return
        begin = round(start * rate)
        end = min(count, begin + round(length * rate))
        if begin >= count or end <= begin:
            return
        tt = np.arange(end - begin) / rate
        hz = 440 * 2 ** ((midi - 69) / 12)
        envelope = (1 - np.exp(-tt * 75)) * np.exp(-tt * decay)
        tone = (np.sin(2 * np.pi * hz * tt) + .28 * np.sin(2 * np.pi * hz * 2 * tt)
                + .08 * np.sin(2 * np.pi * hz * 3 * tt)) / 1.36
        mix[begin:end] += volume * envelope * tone

    beat = 60 / 92
    for step in range(24):
        start = step * beat
        chord = chords[(step // 6) % 4]
        if step % 6 == 0:
            for pitch in chord:
                note(start, 2.3, pitch, .030, 1.1)
        note(start, .44, chord[0] - 24 if step % 2 == 0 else chord[2] - 24,
             .16, 5.0)
        pos = round(start * rate)
        n = min(round(.25 * rate), count - pos)
        if n > 0:
            tt = np.arange(n) / rate
            mix[pos:pos + n] += .18 * np.sin(2 * np.pi * (75 - 48 * tt) * tt) * np.exp(-tt * 23)
        if step % 2 == 1:
            pos = round((start + .01) * rate)
            n = min(round(.17 * rate), count - pos)
            if n > 0:
                tt = np.arange(n) / rate
                mix[pos:pos + n] += .045 * rng.standard_normal(n) * np.exp(-tt * 27)
        for offset in (0, .5):
            pos = round((start + offset * beat) * rate)
            n = min(round(.075 * rate), count - pos)
            if n > 0:
                tt = np.arange(n) / rate
                mix[pos:pos + n] += .022 * rng.standard_normal(n) * np.exp(-tt * 65)
        note(start + .08, .40, melody[step % len(melody)], .070, 6.0)

    for transition in (3, 6, 10, 13):
        pos = round((transition - .17) * rate)
        n = round(.30 * rate)
        tt = np.arange(n) / rate
        mix[pos:pos + n] += .047 * rng.standard_normal(n) * np.sin(np.pi * tt / .30) ** 2
    fade = np.minimum(1, np.arange(count) / (.25 * rate))
    fade *= np.minimum(1, (count - np.arange(count)) / (.65 * rate))
    mix *= fade
    mix = np.clip(mix / max(.4, np.max(np.abs(mix))) * .82, -.98, .98)
    stereo = np.stack((mix, np.roll(mix, 13)), axis=1)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((stereo * 32767).astype("<i2").tobytes())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG", "ffmpeg"))
    parser.add_argument("--stills", action="store_true")
    args = parser.parse_args()
    output = ROOT / "output"
    output.mkdir(parents=True, exist_ok=True)
    if args.stills:
        for second in (0.8, 3.9, 6.9, 8.3, 11.6, 14.2):
            frame_at(second).save(output / f"frame-{second:.1f}.jpg", quality=90)
        return
    score = output / "score.wav"
    write_score(score)
    target = ROOT / "tonight-card-15s.mp4"
    command = [args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
               "-r", str(FPS), "-i", "pipe:0", "-i", str(score),
               "-af", "acompressor=threshold=-18dB:ratio=3:attack=10:release=200,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.78:level=false,aresample=48000,atrim=0:15",
               "-c:v", "libx264", "-preset", "fast", "-crf", "21",
               "-pix_fmt", "yuv420p", "-r", str(FPS),
               "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
               "-t", str(DURATION), "-movflags", "+faststart", str(target)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for number in range(DURATION * FPS):
            process.stdin.write(frame_at(number / FPS).tobytes())
            if number % 90 == 0:
                print(f"Rendered {number / FPS:.0f}s / {DURATION}s", flush=True)
    finally:
        process.stdin.close()
    if process.wait():
        raise SystemExit("FFmpeg failed to render the promo")
    frame_at(14.2).save(ROOT / "cover.jpg", quality=88)
    print(target)


if __name__ == "__main__":
    main()
