"""يبني data/quran.js من صفحات quran.com وملف الصرف.

الاستخدام: py -I -X utf8 tools/build_quran.py <pages_dir> <morphology.txt> <out_dir>
"""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import plain, write_js

pages_dir, morph_path, out = sys.argv[1:4]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'quran-majlis-offline-builder'})
    return json.load(urllib.request.urlopen(req, timeout=30))


chapters = get('https://api.quran.com/api/v4/chapters?language=ar')['chapters']

morph = {}
for line in open(morph_path, encoding='utf8'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 4:
        continue
    s, a, w, _ = parts[0].split(':')
    d = morph.setdefault((int(s), int(a), int(w)), {})
    for f in parts[3].split('|'):
        if f.startswith('ROOT:'):
            d.setdefault('root', f[5:])
        elif f.startswith('LEM:') and ('PREF' not in parts[3] and 'SUFF' not in parts[3] or 'lem' not in d):
            d['lem'] = f[4:]

roots, lemmas = {}, {}


def idx(table, key):
    if key is None:
        return -1
    return table.setdefault(key, len(table))


ayah_ids = {}
for c in chapters:
    for a in range(1, c['verses_count'] + 1):
        ayah_ids[(c['id'], a)] = len(ayah_ids)

basmala = None
juz = {}
mismatch = []
count_words = 0

verses = []
for p in range(1, 605):
    verses += json.load(open(f'{pages_dir}/p{p:03}.json', encoding='utf8'))
verses.sort(key=lambda v: ayah_ids[tuple(map(int, v['verse_key'].split(':')))])

# الواجهة تعطي أحياناً كلمات أول سطر أو آخر سطر رقم الصفحة المجاورة،
# فيُصحَّح الموضع بتتبّع الكلمات بالترتيب: السطر لا يتراجع داخل الصفحة.
pages_map = {}
cur_p, cur_l = 1, 1
for v in verses:
    s, a = map(int, v['verse_key'].split(':'))
    gid = ayah_ids[(s, a)]
    if basmala is None:
        basmala = ' '.join(w['text_qpc_hafs'] for w in v['words'] if w['char_type_name'] == 'word')
    last = max(w['position'] for w in v['words'] if w['char_type_name'] == 'word')
    if (s, a, last) not in morph or (s, a, last + 1) in morph:
        mismatch.append(v['verse_key'])
    for w in v['words']:
        p, line = w['page_number'], w['line_number']
        if p <= cur_p and line < cur_l:
            p = cur_p + 1
        elif p == cur_p + 1 and line > 3 and line <= cur_l + 1:
            p = cur_p
        elif p < cur_p:
            p = cur_p
        cur_p, cur_l = p, line
        row = pages_map.setdefault(p, {}).setdefault(line, [])
        if w['char_type_name'] == 'end':
            row.append([gid, 0, w['text_qpc_hafs']])
            continue
        if w['position'] == 1:
            juz.setdefault(v['juz_number'], [s, a, p])
        m = morph.get((s, a, w['position']), {})
        row.append([gid, w['position'], w['text_qpc_hafs'], idx(roots, m.get('root')), idx(lemmas, m.get('lem'))])
        count_words += 1

first_ayah = {ayah_ids[(c['id'], 1)]: c['id'] for c in chapters}
pages = []
surah_page = {}
for p in range(1, 605):
    lines = pages_map[p]
    rows = []
    prev = 0
    for n in sorted(lines):
        first = lines[n][0]
        gap = n - prev - 1
        if first[1] == 1 and first[0] in first_ayah:
            sid = first_ayah[first[0]]
            surah_page[sid] = p
            if sid in (1, 9):
                rows += [['S', sid]]
            else:
                rows += [['S', sid], ['B']]
        rows.append(lines[n])
        prev = n
    pages.append(rows)

surahs = [[c['name_arabic'], c['verses_count'], 'مكية' if c['revelation_place'] == 'makkah' else 'مدنية', surah_page[c['id']]]
          for c in chapters]
write_js(f'{out}/quran.js', 'QD.init', {
    's': surahs, 'j': [juz[i] for i in range(1, 31)], 'r': list(roots), 'l': list(lemmas),
    'b': basmala, 'p': pages})

print('ayahs', len(ayah_ids), 'words', count_words, 'roots', len(roots), 'lemmas', len(lemmas))
print('word-count mismatches with morphology:', mismatch[:20], len(mismatch))
print('pages with row count != 15:', [(i + 1, len(r)) for i, r in enumerate(pages) if len(r) != 15])
print('juz', [juz[i] for i in (1, 2, 30)])
