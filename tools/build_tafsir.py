"""يربط نص التفسير بالآيات ويكتب data/tafsir/<id>/NNN.js.

كل آية تُبحث في النص بالترتيب، ولا تُقبل علامة الآية إلا إذا طابق رقمها الرقم المتوقع
وطابق نصها رسم الآية نفسها، فلا يُنسب تفسير إلى غير آيته.

الاستخدام: py -I -X utf8 tools/build_tafsir.py <jawami|majma|mizan|amthal> <source.txt> <uthmani.json> <out_dir>
"""
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import skeleton, write_js

source_id, src_path, quran_path, out = sys.argv[1:5]
SURAH_NAMES = None

quran = json.load(open(quran_path, encoding='utf8'))['data']['surahs']
BASMALA = skeleton('بسم الله الرحمن الرحيم')


def ayah_skeleton(s, a):
    sk = skeleton(a['text'])
    # هذا المصدر يلصق البسملة بأول آية من كل سورة
    if a['numberInSurah'] == 1 and s['number'] != 1 and sk.startswith(BASMALA):
        sk = sk[len(BASMALA):]
    return sk


ayahs = [(s['number'], a['numberInSurah'], ayah_skeleton(s, a)) for s in quran for a in s['ayahs']]

AMTHAL_HEAD = '\x02'
raw = open(src_path, encoding='utf8').read()
raw = raw[raw.index('#META#Header#End#') + len('#META#Header#End#'):]
raw = re.sub(r'PageV\d+P\d+', ' ', raw)
raw = re.sub(r'\bms\d+\b', ' ', raw)
raw = re.sub(r'\bMilestone\d+\b', ' ', raw)
if source_id == 'mizan':
    # الفقرات مهمة في الميزان: «~~» تتمة سطر و«#» فقرة جديدة
    raw = re.sub(r'^#+ ?الميزان في تفسير القر[آا]ن[ \d]*$', '', raw, flags=re.M)
    raw = raw.replace('\n~~', ' ')
    raw = re.sub(r'</?a\b[^>]*>', '', raw)
if source_id == 'amthal':
    # عناوين الأمثل تبقى أقساماً، و«~~» تتمة سطر
    raw = re.sub(r'@QUR@\d+ ?', '', raw).replace('\ufeff', '')
    raw = re.sub(r'^#+ ?\|+ ?(.*)$', lambda m: AMTHAL_HEAD + m.group(1), raw, flags=re.M)
    raw = raw.replace('\n~~', ' ')
raw = re.sub(r'^~~', '', raw, flags=re.M)
raw = re.sub(r'^#+ ?(\| ?)*', '', raw, flags=re.M)
raw = raw.replace('\u200d', '')
text = re.sub(r'[ \t]+', ' ', raw)
if source_id == 'jawami':
    text = re.sub(r'سورة [^\s/]+(?: [^\s/]+){0,3} / \d+(?: ?(?:و|-) ?\d+)*', ' ', text)
    text = re.sub(r'\n(?=[^*\n])', ' ', text)

WINDOW = 60000 if source_id == 'jawami' else 300000


def similar(a, b):
    if not a or not b:
        return 0
    if len(b) < 14:
        return 1 if a.endswith(b) else 0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


# (موضع بداية الآية في النص، موضع نهايتها) لكل آية وُجدت
found = {}
# مقدمة المحقق والمؤلف في مجمع البيان تسبق الفاتحة بكثير
ptr = max(text.find('رب العالمين (2)') - 9000, 0) if source_id == 'majma' else 0
if source_id == 'amthal':
    ptr = text.index(AMTHAL_HEAD + 'سورة الحمد')
for i, (s, a, sk) in enumerate(ayahs if source_id != 'amthal' else []):
    tail = max(len(sk) * 2 + 30, 60)
    # الآية القصيرة تتكرر في الشواهد، فلا يُبحث عنها إلا قريباً
    reach = WINDOW if len(sk) >= 25 else WINDOW // 12
    for m in re.compile(r'(?<![\d])%d(?![\d])' % a).finditer(text, ptr, min(ptr + reach, len(text))):
        before = text[max(ptr, m.start() - tail * 2):m.start()]
        before_sk = skeleton(before)[-len(sk):]
        if similar(before_sk, sk) > .78:
            start = m.start()
            seen = 0
            # الرجوع إلى بداية نص الآية في المصدر
            while start > ptr and seen < len(sk):
                start -= 1
                if skeleton(text[start]):
                    seen += 1
            found[i] = (start, m.end())
            ptr = m.end()
            break

print('matched by number', len(found))


def second_pass():
    """آيات بلا رقم في المصدر: يُبحث عن مطلع رسمها بين الآيتين المجاورتين."""
    order = sorted(found)
    extra = {}
    for n, i in enumerate(order[:-1]):
        j = order[n + 1]
        if j == i + 1:
            continue
        lo, hi = found[i][1], found[j][0]
        idx = [k for k in range(lo, hi) if skeleton(text[k])]
        sk_text = ''.join(skeleton(text[k]) for k in idx)
        pos = 0
        for g in range(i + 1, j):
            sk = ayahs[g][2]
            probe = sk[:18]
            if len(probe) < 7:
                continue
            at = sk_text.find(probe, pos)
            if at < 0:
                continue
            e = at + min(len(sk), len(sk_text) - at) - 1
            extra[g] = (idx[at], idx[e] + 1)
            pos = e
    found.update(extra)




def amthal_blocks():
    """في الأمثل تأتي الآيات تحت عنوان «الآية» أو «الآيات» بلا أرقام، فتُطابَق برسمها بالترتيب."""
    cur = 0
    for m in re.finditer(AMTHAL_HEAD + r'(?:الآية|الآيات|الآيتان)[^\n]*\n', text):
        end = text.find(AMTHAL_HEAD, m.end())
        block = skeleton(text[m.end():end])
        if len(block) < 3:
            continue
        probe = block[:16]
        first = None
        for i in range(cur, min(cur + 90, len(ayahs))):
            # الآية القصيرة لا تكفي للمطابقة، فيُضم إليها ما بعدها
            head = ''.join(x[2] for x in ayahs[i:i + 12])[:len(probe)]
            if head and similar(head, probe) > .8:
                first = i
                break
        if first is None:
            continue
        last = first
        size = len(ayahs[first][2])
        # تُضم الآية التالية ما دام طول الآيات يقترب من طول النص، ولا يُتجاوز آخر السورة
        while (last + 1 < len(ayahs) and ayahs[last + 1][0] == ayahs[first][0]
               and abs(size + len(ayahs[last + 1][2]) - len(block)) < abs(size - len(block))):
            last += 1
            size += len(ayahs[last][2])
        for k in range(first, last):
            found[k] = (m.start(), m.start())
        found[last] = (m.start(), end)
        cur = last + 1


if source_id == 'amthal':
    amthal_blocks()
else:
    second_pass()
print('matched', len(found), 'of', len(ayahs))
missing = [ayahs[i][:2] for i in range(len(ayahs)) if i not in found]
per = {}
for s, a in missing:
    per[s] = per.get(s, 0) + 1
print('surahs with most gaps', sorted(per.items(), key=lambda kv: -kv[1])[:15])
print('sample gaps', missing[:30])

NEXT_SURAH = re.compile(r'(?:\n|\. ?)(?:تفسير )?سورة [^\n.]{2,20}? (?:مكية|مدنية|مختلف فيها)')
END_CUT = re.compile(r'(?:تفسير )?سورة [^\n.]{2,20}\s*$')


def clean(t):
    t = re.sub(r'\* ?\(', '﴿', t)
    t = re.sub(r'\) ?\*', '﴾', t)
    t = re.sub(r'(?<=[^\s\d(])\s?\(\d{1,2}\)(?=[\s.,،؛:]|$)', '', t)  # إحالات الحواشي
    t = re.sub(r'\[\d{1,3}\]', '', t)
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r' ?\n ?', ' ', t) if source_id == 'jawami' else t
    return t.strip(' \n.،')


SECTIONS = ['النزول', 'المعنى', 'اللغة', 'الاعراب', 'القراءة', 'الحجة', 'النظم', 'القصة', 'الاسناد', 'الفضل', 'المشكل']
SECT = re.compile(r'(?:^|\n)\s*(' + '|'.join(SECTIONS) + r')\s*:')
ORDER = {n: i for i, n in enumerate(SECTIONS)}


MIZAN_HEAD = re.compile(r'^\(?(بيان|بحث روائي|بحث [^\s()]{3,12}(?= )|كلام في [^\n.:،]{3,50}?)\)?(?= |$)')


def mizan_sections(t):
    res = [['', '']]
    for para in re.split(r'\s*\n\s*', t):
        if re.match(r'\([\d١-٩]+\) ', para):  # حاشية مجموعة في آخر الملف
            continue
        m = MIZAN_HEAD.match(para)
        if m and (para.startswith('(') or m.group(1) != 'بيان'):
            res.append([m.group(1), para[m.end():].strip()])
        elif para:
            res[-1][1] = (res[-1][1] + '\n' + para).strip()
    return [r for r in res if r[1]]


AMTHAL_SKIP = {'الآية', 'الآيات', 'الآيتان', 'التفسير', 'مكية', 'مدنية'}


def amthal_sections(t):
    res = [['', '']]
    for para in re.split(r'\s*\n\s*', t):
        if para.startswith(AMTHAL_HEAD):
            head = para[1:].strip()
            if head.startswith('EDITOR'):  # حواشي الكتاب مجموعة بعد آخر سورة
                break
            if head not in AMTHAL_SKIP:
                res.append([head, ''])
        elif para:
            res[-1][1] = (res[-1][1] + '\n' + para).strip()
    return [r for r in res if r[1]]


def sections(t):
    if source_id == 'mizan':
        return mizan_sections(t)
    if source_id == 'amthal':
        return amthal_sections(t)
    if source_id != 'majma':
        return [['', re.sub(r'\s*\n\s*', ' ', t)]]
    ms = list(SECT.finditer(t))
    if not ms:
        return [['', re.sub(r'\s*\n\s*', ' ', t)]]
    res = []
    head = t[:ms[0].start()].strip()
    for i, m in enumerate(ms):
        e = ms[i + 1].start() if i + 1 < len(ms) else len(t)
        res.append([m.group(1), re.sub(r'\s*\n\s*', ' ', t[m.end():e]).strip()])
    res.sort(key=lambda r: ORDER[r[0]])
    if head:
        res.insert(0, ['', re.sub(r'\s*\n\s*', ' ', head)])
    return res


# الآيات المتتالية بلا شرح بينها مجموعة واحدة يشملها الشرح الذي يليها،
# والآية التي لم يُعثر عليها تُلحق بما قبلها في السورة نفسها
order = sorted(found)
by_surah = {}
pending = None
for n, i in enumerate(order):
    s, a, _ = ayahs[i]
    end = found[i][1]
    nxt = order[n + 1] if n + 1 < len(order) else None
    stop = found[nxt][0] if nxt is not None else len(text)
    body = text[end:stop]
    if pending is None:
        pending = [s, a, a, '']
    pending[2] = a
    same = nxt is not None and ayahs[nxt][0] == s
    if len(re.sub(r'[^ء-ي]', '', body)) < 25 and same:
        continue
    pending[3] = body
    if nxt is not None and same:
        pending[2] = ayahs[nxt][1] - 1
    elif not same:
        pending[2] = next_end = max(x[1] for x in ayahs if x[0] == s)
    by_surah.setdefault(s, []).append(pending)
    pending = None

os.makedirs(f'{out}/{source_id}', exist_ok=True)
total = 0
for s, gs in by_surah.items():
    rows = []
    for g in gs:
        body = re.sub(r'^[\])\s.،]*(?:\*(?! ?\())?[\s.،]*', '', g[3])
        body = NEXT_SURAH.split(body)[0]
        if source_id == 'amthal':
            body = re.split(AMTHAL_HEAD + r'سورة ', body)[0]
        if source_id == 'mizan':
            body = re.split(r'\n\s*\(سورة [^\n)]{2,70}\)', body)[0]
            body = re.sub(r'\s*\*\s*\*\s*\*[^*]{0,120}$', '', body)  # فاصل المقطع التالي
        body = clean(re.sub(r'[\s*(\[]+(?:[ء-ي]{1,3}\s*)?$', '', body))
        if s < 114:
            body = END_CUT.sub('', body).rstrip()
        if source_id == 'majma' and s == 114:
            # بعد سورة الناس تأتي خاتمة الكتاب وفهارس المحقق
            body = body[:body.index('المعنى:', body.index('المعنى:') + 10)].rstrip()
        rows.append([g[1], g[2], sections(body)])
        total += len(body)
    write_js(f'{out}/{source_id}/{s:03}.js', 'QD.tafsir', source_id, s, rows)
print('surahs written', len(by_surah), 'chars', total)
