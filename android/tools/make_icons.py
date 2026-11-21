#!/usr/bin/env python3
"""
Generate the Android app's icons and splash images from the iOS asset catalog, so both
apps share one source of artwork (ios/App/App/Assets.xcassets).

Writes into android/app/src/main/res:
  - Launcher icons for the main icon and each theme icon (WidgetBridgePlugin.setAppIcon):
    legacy square/round PNGs, adaptive-icon layers, and a themed (monochrome) layer.
  - The status-bar notification icon (white silhouette).
  - The Android 12+ splash icon and the pre-12 full-screen splash images.

Usage (needs Pillow): python3 android/tools/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'ios/App/App/Assets.xcassets'
RES = ROOT / 'android/app/src/main/res'

# Resource suffix → iOS source. '' is the main icon (light theme and the default).
ICONS = {
    '': ASSETS / 'AppIcon.appiconset/AppIcon-512@2x.png',
    '_dawn': ASSETS / 'AppIconDawn.appiconset/AppIcon.png',
    '_penumbra': ASSETS / 'AppIconPenumbra.appiconset/AppIcon.png',
    '_dusk': ASSETS / 'AppIconDusk.appiconset/AppIcon.png',
    '_dark': ASSETS / 'AppIconDark.appiconset/AppIcon.png',
}
TINTED = ASSETS / 'AppIcon.appiconset/AppIcon-Tinted.png'
SPLASH = ASSETS / 'Splash.imageset/splash-2732x2732.png'

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

# Adaptive icons draw a 108dp layer and show its middle 72dp (often as a circle). The
# chair spans ~57% of the iOS artwork; at 80% it sits inside the circle with room to spare,
# and the artwork's edges fall outside the visible part.
ADAPTIVE_SCALE = 0.8


def background_color(image: Image.Image) -> tuple[int, int, int]:
    return image.convert('RGB').getpixel((2, 2))


def hex_color(rgb: tuple[int, int, int]) -> str:
    return '#{:02X}{:02X}{:02X}'.format(*rgb)


def centered(image: Image.Image, size: int, scale: float) -> Image.Image:
    """`image` resized to `scale` of a transparent `size` square, centered."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = max(1, round(size * scale))
    resized = image.convert('RGBA').resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def circle(image: Image.Image) -> Image.Image:
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, image.size[0] - 1, image.size[1] - 1), fill=255)
    out = image.convert('RGBA')
    out.putalpha(mask)
    return out


def white_silhouette(source: Path) -> Image.Image:
    """The tinted icon (white chair on black) as white with brightness as alpha."""
    gray = Image.open(source).convert('L')
    white = Image.new('RGBA', gray.size, (255, 255, 255, 0))
    white.putalpha(gray)
    return white


def write(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def launcher_icons() -> dict[str, str]:
    colors = {}
    monochrome = white_silhouette(TINTED)
    for suffix, source in ICONS.items():
        art = Image.open(source).convert('RGBA')
        bg = background_color(art)
        colors[f'ic_launcher{suffix}_background'] = hex_color(bg)
        for density, factor in DENSITIES.items():
            folder = RES / f'mipmap-{density}'
            legacy = round(48 * factor)
            write(art.resize((legacy, legacy), Image.LANCZOS), folder / f'ic_launcher{suffix}.png')
            # Round legacy icon: the artwork a little smaller on its own background color.
            round_canvas = Image.new('RGBA', (legacy, legacy), bg + (255,))
            round_canvas = Image.alpha_composite(round_canvas, centered(art, legacy, 0.86))
            write(circle(round_canvas), folder / f'ic_launcher{suffix}_round.png')
            layer = round(108 * factor)
            write(centered(art, layer, ADAPTIVE_SCALE), folder / f'ic_launcher{suffix}_foreground.png')
            if suffix == '':
                write(centered(monochrome, layer, ADAPTIVE_SCALE), folder / 'ic_launcher_monochrome.png')
        adaptive = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            f'    <background android:drawable="@color/ic_launcher{suffix}_background" />\n'
            f'    <foreground android:drawable="@mipmap/ic_launcher{suffix}_foreground" />\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
            '</adaptive-icon>\n'
        )
        anydpi = RES / 'mipmap-anydpi-v26'
        anydpi.mkdir(parents=True, exist_ok=True)
        (anydpi / f'ic_launcher{suffix}.xml').write_text(adaptive)
        (anydpi / f'ic_launcher{suffix}_round.xml').write_text(adaptive)
    return colors


def notification_icon() -> None:
    silhouette = white_silhouette(TINTED)
    # Crop to the chair (the artwork's middle) so it fills the 24dp status bar icon.
    w, h = silhouette.size
    chair = silhouette.crop((int(w * 0.17), int(h * 0.17), int(w * 0.83), int(h * 0.83)))
    for density, factor in DENSITIES.items():
        size = round(24 * factor)
        write(chair.resize((size, size), Image.LANCZOS), RES / f'drawable-{density}/ic_stat_anilounge.png')


def splash_images() -> None:
    art = Image.open(SPLASH).convert('RGBA')
    # Android 12+: a 288dp icon (its middle 192dp circle shows) on the splash color.
    dark = Image.open(ICONS['_dark']).convert('RGBA')
    for density, factor in DENSITIES.items():
        size = round(288 * factor)
        write(centered(dark, size, 0.62), RES / f'drawable-{density}/splash_icon.png')
    # Before Android 12: full-screen images, cropped from the middle of the iOS splash.
    for path in RES.glob('drawable*/splash.png'):
        width, height = Image.open(path).size
        side = max(width, height)
        square = art.resize((side, side), Image.LANCZOS)
        left, top = (side - width) // 2, (side - height) // 2
        write(square.crop((left, top, left + width, top + height)), path)


def main() -> None:
    colors = launcher_icons()
    notification_icon()
    splash_images()
    lines = ['<?xml version="1.0" encoding="utf-8"?>', '<!-- Generated by android/tools/make_icons.py -->', '<resources>']
    lines += [f'    <color name="{name}">{value}</color>' for name, value in colors.items()]
    lines += ['</resources>', '']
    (RES / 'values/ic_launcher_background.xml').write_text('\n'.join(lines))
    print('Icons written to', RES)


if __name__ == '__main__':
    main()
