"""أدوات مشتركة لبناء بيانات الموقع."""
import json
import re
import unicodedata

HARAKAT = re.compile(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF\u200c-\u200f]')


def strip(s):
    """إزالة التشكيل وعلامات الوقف والمد."""
    return HARAKAT.sub('', unicodedata.normalize('NFC', s))


def plain(s):
    """توحيد الهمزات والألف المقصورة لمقارنة الكلمات."""
    s = strip(s)
    for a, b in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ٱ', 'ا'), ('ء', ''), ('ؤ', 'و'), ('ئ', 'ي'),
                 ('ى', 'ي'), ('ة', 'ه'), ('ۥ', ''), ('ۦ', ''), ('ٰ', '')):
        s = s.replace(a, b)
    return s


def skeleton(s):
    """هيكل الرسم بلا حروف علة، لأن رسم المصحف يخالف الإملاء فيها."""
    return re.sub(r'[^ء-ي]|[اويىءئؤأإآ]', '', plain(s))


def write_js(path, call, *args):
    """ملفات البيانات سكربتات لا JSON كي تعمل حتى من file:// حيث يُمنع fetch."""
    body = ','.join(json.dumps(a, ensure_ascii=False, separators=(',', ':')) for a in args)
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write(f'{call}({body});\n')
