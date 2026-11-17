#!/usr/bin/env python3
"""Render the 4:3 companion cover for Douyin's horizontal placements."""

from PIL import Image, ImageDraw, ImageFont

from render import FAN, GOLD, PAPER, PLUM, ROOT, SANS, SERIF


def main():
    image = Image.new("RGB", (1440, 1080), PLUM)
    draw = ImageDraw.Draw(image)
    for y in range(1080):
        ratio = y / 1080
        draw.line((0, y, 1439, y), fill=(
            round(39 - 8 * ratio), round(27 + 12 * ratio), round(46 - 3 * ratio)
        ))

    draw.line((90, 105, 1350, 105), fill=GOLD, width=2)
    draw.text((96, 130), "聚会网页游戏", font=ImageFont.truetype(SANS, 31), fill=GOLD)
    draw.text((96, 222), "今夜开牌", font=ImageFont.truetype(SERIF, 116), fill=PAPER)
    draw.text((100, 397), "小姐牌 · 大姐牌 · 少爷牌",
              font=ImageFont.truetype(SANS, 38), fill=GOLD)
    draw.line((100, 511, 555, 511), fill=(140, 116, 113), width=2)
    draw.text((100, 562), "朋友迟到，", font=ImageFont.truetype(SERIF, 69), fill=PAPER)
    draw.text((100, 657), "随时入座。", font=ImageFont.truetype(SERIF, 69), fill=GOLD)

    art = FAN.resize((680, 680), Image.Resampling.LANCZOS)
    mask = Image.new("L", art.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 679, 679), radius=24, fill=255)
    image.paste(art, (670, 156), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((669, 155, 1350, 837), radius=25, outline=GOLD, width=2)
    draw.rounded_rectangle((90, 897, 1350, 997), radius=13, fill=(223, 199, 153))
    draw.text((720, 947), "frankjie09.github.io/lady-card/",
              font=ImageFont.truetype(SANS, 49), fill=PLUM, anchor="mm")
    image.save(ROOT / "cover-douyin-4x3.jpg", quality=94)


if __name__ == "__main__":
    main()
