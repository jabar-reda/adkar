"""يولّد أيقونة التطبيق وشاشة البداية من هوية أذكار بلا أي أداة خارجية.

يعيد رسم تصميم app/favicon.svg حرفياً بمقاييس مضخّمة: نجمة رباعية بيضاء
على أخضر الفجر للأيقونة، وماركة خضراء على الفجر الفاتح لشاشة البداية.
الأيقونة مربعة كاملة الحواف (بلا زوايا دائرية) لأن قاذف التطبيقات هو
من يقصّ الزوايا بنفسه. يرسم بالعينات الفرعية (2×2) لتنعيم الحواف، ويكتب
PNG بـRGB عبر zlib فقط. الناتج في apk/assets يقرؤه @capacitor/assets داخل CI.
"""
import struct
import zlib

# ألوان الهوية من app/favicon.svg و:root في app/styles.css
GREEN = (0x0D, 0x6A, 0x4D)      # خلفية الأيقونة (--accent)
WHITE = (0xF6, 0xFA, 0xF5)      # لون النجمة (--surface)
DAY_BG = (0xE7, 0xEF, 0xE8)     # خلفية شاشة البداية (--bg)
SAMPLES = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))

# مضلع النجمة الرباعية من مسار favicon.svg (شبكة 32): أطرافها على
# المحاور بمسافة 10 من المركز، ورأسها الغائر بين كل طرفين عند (±2.6، ±2.6).
STAR_32 = [
    (16.0, 6.0), (18.6, 13.4),
    (26.0, 16.0), (18.6, 18.6),
    (16.0, 26.0), (13.4, 18.6),
    (6.0, 16.0), (13.4, 13.4),
]


def star_polygon(cx, cy, scale):
    """نسخة من مضلع النجمة محورة المركز ومكبّرة بمعامل scale."""
    return [(cx + (x - 16.0) * scale, cy + (y - 16.0) * scale) for x, y in STAR_32]


def inside_polygon(x, y, points):
    """اختبار نقطة داخل مضلع بأسلوب العدد الزوجي (ray casting)."""
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y):
            crossing = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < crossing:
                inside = not inside
        j = i
    return inside


def pixel_color(x, y, layers):
    """لون النقطة من أعلى طبقة تضمها: الفحص من آخر طبقة في القائمة
    إلى أولها، فتظهر الطبقات اللاحقة فوق السابقة كما في CSS."""
    for color, test in reversed(layers):
        if test(x, y):
            return color
    return None


def render(size, bg, layers):
    """يرسم مربعاً بحجم size؛ كل طبقة (لون، اختبار) فوق التي تليها."""
    ss = 2
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            for sx, sy in SAMPLES:
                x = px + sx / ss
                y = py + sy / ss
                color = pixel_color(x, y, layers)
                c = bg if color is None else color
                r += c[0]
                g += c[1]
                b += c[2]
            row += bytes((r // 4, g // 4, b // 4))
        rows.append(row)
    return rows


def upscale(rows, size, factor):
    """تكبير بالجار الأقرب أفقياً وعمودياً؛ التصميم مسطّح فلا يتشوه."""
    out = []
    for y in range(size * factor):
        base = rows[y // factor]
        row = bytearray()
        for x in range(size * factor):
            i = (x // factor) * 3
            row += base[i:i + 3]
        out.append(bytes(row))
    return out


def write_png(path, rows):
    """يكتب PNG 8-bit RGB بلا مرشّحات."""
    height, width = len(rows), len(rows[0]) // 3
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print("كُتب", path, width, "×", height)


# الأيقونة 1024: نجمة بيضاء بنفس نسب favicon.svg (قطرها 62.5% من الوجه)
icon_scale = 1024 * (10.0 / 32.0) / 10.0
icon_rows = render(
    1024, GREEN,
    [(WHITE, lambda x, y: inside_polygon(x, y, star_polygon(512, 512, icon_scale)))],
)
write_png("apk/assets/icon.png", icon_rows)

# شاشة البداية: خلفية فجرية وماركة خضراء، تُرسم 1366 ثم تُكبَّر إلى 2732
splash_scale = 1366 * (10.0 / 32.0) / 10.0
splash_rows = render(
    1366, DAY_BG,
    [(GREEN, lambda x, y: inside_polygon(x, y, star_polygon(683, 683, splash_scale)))],
)
write_png("apk/assets/splash.png", upscale(splash_rows, 1366, 2))
