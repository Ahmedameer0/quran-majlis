"""يولّد sw-files.js بقائمة ملفات الموقع وبصمة كل ملف.

شغّله بعد أي تعديل وقبل الرفع: py -I -X utf8 tools/build_pwa.py
"""
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', '.github', '.claude', 'android', 'tools', '__pycache__'}
SKIP_FILES = {'README.md', 'CLAUDE.md', 'sw.js', 'sw-files.js', '.gitignore', '.nojekyll',
              'signing-secrets-DO-NOT-SHARE.txt'}

files = {}
for folder, dirs, names in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in names:
        if name in SKIP_FILES:
            continue
        full = os.path.join(folder, name)
        rel = os.path.relpath(full, ROOT).replace(os.sep, '/')
        if rel == 'data/local-sources.js' or rel.startswith(('data/tafsir/mizan/', 'data/tafsir/amthal/')):  # لا تُنشر
            continue
        with open(full, 'rb') as f:
            files[rel] = hashlib.sha256(f.read()).hexdigest()[:10]

# ما يكفي لفتح الموقع وعرض المصحف؛ التفاسير تُحفظ بعده في الخلفية
core = sorted(p for p in files if not p.startswith('data/tafsir/') and p != 'data/lexicon.js')

with open(os.path.join(ROOT, 'sw-files.js'), 'w', encoding='utf8', newline='\n') as f:
    f.write('var FILES = ' + json.dumps(dict(sorted(files.items())), separators=(',', ':')) + ';\n')
    f.write('var CORE = ' + json.dumps(core, separators=(',', ':')) + ';\n')

size = sum(os.path.getsize(os.path.join(ROOT, p)) for p in files)
print('files', len(files), 'core', len(core), 'MB', round(size / 1e6, 1))
