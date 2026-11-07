"""يستخرج مداخل «مفردات ألفاظ القرآن» للراغب ويربطها بجذور الصرف.

الكتاب مرتب هجائياً، فتُحدَّد رؤوس المداخل بأطول تسلسل غير متناقص بين المرشحين،
فلا تُحسب «قال:» وأشباهها في أثناء الشرح مدخلاً جديداً.

الاستخدام: py -I -X utf8 tools/build_lexicon.py <raghib.txt> <quran.js> <out_dir>
"""
import bisect
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import plain, strip, write_js

src, quran_js, out = sys.argv[1:4]
q = open(quran_js, encoding='utf8').read()
roots = json.loads(q[q.index('(') + 1:q.rindex(')')])['r']


def keys(root):
    """الصيغ التي قد يُكتب بها الجذر رأساً للمدخل في الكتاب."""
    r = plain(root)
    res = {r}
    if len(r) == 3 and r[1] == r[2]:
        res.add(r[:2])
    return res


by_key = {}
for i, r in enumerate(roots):
    for k in keys(r):
        by_key.setdefault(k, []).append(i)

raw = open(src, encoding='utf8').read()
raw = raw[raw.index('#META#Header#End#') + 17:]
raw = re.sub(r'PageV\d+P\d+|\bms\d+\b|NoteV\d+P\d+N\d+', ' ', raw)
raw = re.sub(r'^# (?=[ء-ي]{2,6}: )', '', raw, flags=re.M)  # رأس فقرة
raw = re.sub(r'^(~~|#+ ?)', '', raw, flags=re.M)
text = re.sub(r'\s+', ' ', raw)

HEAD = re.compile(r'(?:^|(?<=[\s.]))([ء-ي]{2,6}): ')
ALPHA = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'


def rank(word):
    return tuple(ALPHA.find(c) for c in plain(word) if c in ALPHA)


cands = []
for m in HEAD.finditer(text):
    w = plain(m.group(1))
    if w in by_key:
        cands.append((rank(w), m.start(1), m.end(), w, text[m.start(1) - 1] == ''))

# أطول تسلسل غير متناقص
tails, tail_idx, prev = [], [], [None] * len(cands)
for i, c in enumerate(cands):
    pos = bisect.bisect_right(tails, c[0])
    if pos == len(tails):
        tails.append(c[0])
        tail_idx.append(i)
    else:
        tails[pos] = c[0]
        tail_idx[pos] = i
    prev[i] = tail_idx[pos - 1] if pos else None
seq = []
i = tail_idx[-1]
while i is not None:
    seq.append(cands[i])
    i = prev[i]
in_order = set(s[1] for s in seq)
ordered = [c for c in cands if c[1] in in_order]
seq = [c for c in cands if c[1] in in_order or c[4]]


def weak_forms(root):
    """الرأس في الكتاب قد يخالف الجذر في حرف العلة: دعو ← دعا، جيء ← جاء."""
    r = plain(root)
    forms = set()
    if len(r) == 3:
        if r[2] in 'وي':
            forms |= {r[:2] + 'ا', r[:2] + 'و', r[:2] + 'ي'}
        if r[1] in 'وي':
            forms |= {r[0] + 'ا' + r[2], r[0] + 'و' + r[2], r[0] + 'ي' + r[2]}
    if len(r) == 2:
        forms |= {r + 'ا', r[0] + 'ا' + r[1], r + 'و', r + 'ي'}
    return forms - {r}


def related(body, root):
    """مطلع الشرح يذكر مشتقاً من الجذر، فلا يُقبل رأس جاء عرضاً في أثناء مدخل آخر."""
    strong = [c for c in plain(root) if c not in 'اوي']
    if len(strong) < 2:
        return False
    return re.search(strong[0] + '[اويء]*' + strong[1], plain(body[:90])) is not None


# رؤوس تشبه الجذر رسماً وهي غيره في المعنى، حُددت بمراجعة المداخل المضافة واحداً واحداً
WRONG_MATCH = {'كود', 'مول', 'سير', 'خور', 'جور', 'زود', 'مرو', 'ردي', 'ملو', 'كين', 'سيل', 'جيد'}

# جذور شائعة يخالف رأسها في الكتاب رسم الجذر، أو يقع معناها في أثناء مدخل آخر
ALIASES = {
    'صلو': 'والصلاة، قال كثير', 'شيأ': 'شئ: الشئ', 'جيأ': 'جاء: جاء يجئ', 'عبد': 'عبد: العبودية',
    'يدي': 'يد: اليد', 'أبو': 'الأب: الوالد', 'أخو': 'أخ: الأصل', 'ألم': 'الألم: الوجع', 'موه': 'ماء: (وجعلنا',
    'ترب': 'تراب: قال', 'بأس': 'بؤس: البؤس', 'تمم': 'تمام: تمام', 'حوط': 'حائط: الحائط', 'سوي': 'سوا: المساواة',
    'هزأ': 'هزؤ: الهزء', 'هون': 'هان: الهوان', 'يقن': 'يقين: اليقين', 'طمأن': 'طمن: الطمأنينة',
    'صيح': 'صاح: الصيحة', 'خيب': 'خاب: الخيبة', 'أسو': 'أسا: الأسوة', 'أدي': 'أداء: الأداء',
    'خنزر': 'خنزير: قوله', 'أرك': 'أريك: الأريكة', 'خير': 'خير: الخير', 'سوع': 'ساعة: الساعة',
    'سير': 'سار: السير', 'جور': 'جار: الجار', 'نيل': 'نيل: النيل', 'هبط': 'هبط: الهبوط', 'مول': 'والمال سمى',
}

covered = {ri for c in seq for ri in by_key[c[3]]}
ranks = [c[0] for c in ordered]
all_heads = [(m.start(1), m.end(), plain(m.group(1))) for m in HEAD.finditer(text)]
starts = [h[0] for h in all_heads]
added = []
for i, root in enumerate(roots):
    if i in covered or root in WRONG_MATCH or root in ALIASES:
        continue
    # لا يُبحث إلا في موضع الجذر من الترتيب الهجائي
    rk = rank(root)
    lo = ordered[max(bisect.bisect_left(ranks, rk) - 3, 0)][1]
    hi = ordered[min(bisect.bisect_right(ranks, rk) + 3, len(ordered) - 1)][1]
    forms = weak_forms(root)
    for h in all_heads[bisect.bisect_left(starts, lo):bisect.bisect_left(starts, hi)]:
        if h[2] in forms and related(text[h[1]:h[1] + 90], root):
            by_key.setdefault(h[2], []).append(i)
            seq.append((rank(h[2]), h[0], h[1], h[2], False))
            added.append((root, h[2]))
            break
seq = sorted({c[1]: c for c in seq}.values(), key=lambda c: c[1])

entries = {}
for n, c in enumerate(seq):
    stop = seq[n + 1][1] if n + 1 < len(seq) else len(text)
    body = text[c[2]:stop].replace('', '').strip()
    if len(body) < 15:
        continue
    for ri in by_key[c[3]]:
        if str(ri) not in entries or len(entries[str(ri)]) < 40:
            entries[str(ri)] = body[:900] + ('…' if len(body) > 900 else '')

all_starts = [c[1] for c in seq]
for root, phrase in ALIASES.items():
    at = text.find(phrase)
    if at < 0 or root not in roots:
        raise SystemExit('alias not found: ' + root)
    nxt = bisect.bisect_right(all_starts, at + len(phrase))
    stop = all_starts[nxt] if nxt < len(all_starts) else len(text)
    body = re.sub(r'^[ء-ي]{2,6}: ', '', text[at:stop]).replace('\x01', '').strip()
    entries[str(roots.index(root))] = body[:900] + ('…' if len(body) > 900 else '')

write_js(f'{out}/lexicon.js', 'QD.lexicon', entries)
print('candidates', len(cands), 'heads', len(seq), 'roots covered', len(entries), 'of', len(roots))
print('added through weak forms', len(added))
for root, head in added:
    print(' ', root, '<-', head, ':', entries.get(str(roots.index(root)), '-')[:64])
for r in ['كتب', 'رحم', 'هدي', 'دعو'] + list(ALIASES):
    if r in roots:
        print(r, '=>', entries.get(str(roots.index(r)), '-')[:150])
