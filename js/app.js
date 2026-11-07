// ربط الأجزاء: المفاتيح، الموضع المحفوظ، الجلسة، الختمة.
var App = (function () {
  var D = QD;
  var SIZES = [15, 12, 9, 7, 5];
  var SESSION_HOURS = 12;
  var WHEEL_GAP = 320;
  var wordMode = null;   // { list, at } أثناء التنقل بين كلمات الآية
  var session;
  var toastTimer = 0;
  var markedRoots = null;
  var ayahMark = true;
  var markStyle = 'frame';
  var THEMES = [
    { id: 'dark', label: 'كحلي وذهبي' },
    { id: 'black', label: 'أسود' },
    { id: 'green', label: 'أخضر داكن' },
    { id: 'brown', label: 'بني دافئ' },
    { id: 'light', label: 'كريمي كلاسيكي' },
    { id: 'sepia', label: 'ورق قديم' }
  ];
  var MARK_STYLES = [
    { id: 'frame', label: 'إطار حول الآية' },
    { id: 'soft', label: 'خلفية هادئة' },
    { id: 'line', label: 'خط تحت الآية' },
    { id: 'color', label: 'تلوين نص الآية' },
    { id: 'focus', label: 'تعتيم ما حول الآية' },
    { id: 'fade', label: 'تظليل متدرج' },
    { id: 'side', label: 'شريط عند بداية كل سطر' },
    { id: 'dot', label: 'النقطة الذهبية فقط' }
  ];

  function toast(text) {
    var t = document.getElementById('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ───────── الجلسة ───────── */

  function newSession(g) {
    session = { startedAt: Date.now(), read: [], pages: [] };
    Store.write('session', session);
  }

  function loadSession(g) {
    var s = Store.read('session', null);
    if (s && s.read && Date.now() - s.startedAt < SESSION_HOURS * 3600000) session = s;
    else newSession(g);
  }

  function onAdvance(from) {
    Khatma.mark(from);
    // إعادة الآية نفسها لا تُحتسب مرتين
    if (session.read.indexOf(from) < 0) session.read.push(from);
    var p = D.ayahLastPage[from];
    if (session.pages.indexOf(p) < 0) session.pages.push(p);
    Store.write('session', session);
  }

  function onMove(g, page) {
    var a = D.ayahOf(g);
    document.getElementById('barSurah').textContent = 'سورة ' + a.surah.name;
    document.getElementById('barMeta').textContent =
      'الآية ' + D.digits(a.ayah) + ' · الجزء ' + D.digits(D.juzOf(g)) + ' · صفحة ' + D.digits(page);
    document.querySelector('#progress i').style.width = (g + 1) / D.ayahCount * 100 + '%';
    Store.write('pos', { g: g, page: page, at: Date.now() });
    if (wordMode && wordMode.list[wordMode.at] && wordMode.list[wordMode.at].g !== g) exitWordMode();
  }

  /* ───────── تمييز الجذور ───────── */

  function applyRoots(map, message) {
    markedRoots = map;
    Mushaf.setRoots(map);
    if (message) toast(message);
  }

  function clearRoots() {
    if (!markedRoots) return false;
    markedRoots = null;
    Mushaf.setRoots(null);
    toast('أُلغي تمييز الجذور');
    return true;
  }

  function markRoot(g, rootId) {
    var surah = D.ayahOf(g).surah;
    var m = {};
    m[rootId] = true;
    var n = D.rootInSurah(surah, rootId);
    applyRoots(m, 'الجذر «' + D.roots[rootId].split('').join(' ') + '»: ' + D.digits(n) + ' موضعاً في سورة ' + surah.name + ' · اضغط Esc أو رجوع للإلغاء');
  }

  function markAyahRoots(g) {
    var m = {};
    var seen = 0;
    for (var p = D.ayahPage[g]; p <= D.ayahLastPage[g]; p++) {
      D.pages[p - 1].forEach(function (row) {
        if (row[0] === 'S' || row[0] === 'B') return;
        row.forEach(function (w) {
          if (w[0] === g && w[1] && w[3] >= 0 && !m[w[3]]) {
            m[w[3]] = true;
            seen++;
          }
        });
      });
    }
    if (!seen) {
      toast('لا جذور لكلمات هذه الآية');
      return;
    }
    applyRoots(m, 'مُيّزت الكلمات المشتركة مع جذور هذه الآية (' + D.digits(seen) + ' جذراً) في السورة · رجوع للإلغاء');
  }

  /* ───────── وضع الكلمات (للريموت) ───────── */

  function enterWordMode() {
    var list = Mushaf.wordsOfAyah();
    if (!list.length) return;
    wordMode = { list: list, at: 0 };
    Mushaf.setCursor(list[0]);
    toast('الأسهم للتنقل بين الكلمات · OK لفتح الكلمة · رجوع للخروج');
  }

  function exitWordMode() {
    wordMode = null;
    Mushaf.setCursor(null);
  }

  function moveWord(delta) {
    var n = wordMode.list.length;
    wordMode.at = (wordMode.at + delta + n) % n;
    Mushaf.setCursor(wordMode.list[wordMode.at]);
  }

  function openWord(g, i) {
    var w = Mushaf.findWord(g, i);
    if (!w) return;
    Panels.word({ g: g, i: i, word: w }, { tafsir: Panels.tafsir, root: markRoot });
  }

  /* ───────── القوائم ───────── */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme');
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    Store.write('theme', t);
    syncThemeColor();
  }

  // لون شريط النظام في التطبيق المثبت يتبع الوضع المختار
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }

  function nextTheme() {
    var ids = THEMES.map(function (t) { return t.id; });
    var t = THEMES[(ids.indexOf(currentTheme()) + 1) % THEMES.length];
    setTheme(t.id);
    toast(t.label);
  }

  function openTheme() {
    Panels.menu('وضع الألوان', THEMES.map(function (t) {
      return { label: t.label, primary: t.id === currentTheme(), fn: function () { setTheme(t.id); } };
    }));
  }

  function setAyahMark(on) {
    ayahMark = on;
    document.getElementById('sheet').classList.toggle('no-mark', !on);
    document.querySelector('[data-act="mark"]').setAttribute('aria-pressed', on ? 'true' : 'false');
    Store.write('ayahMark', on);
  }

  function setMarkStyle(id) {
    var sheet = document.getElementById('sheet');
    MARK_STYLES.forEach(function (s) { sheet.classList.toggle('mark-' + s.id, s.id === id); });
    markStyle = id;
    Store.write('markStyle', id);
  }

  function openMarkStyle() {
    var items = MARK_STYLES.map(function (s) {
      return {
        label: s.label, primary: ayahMark && s.id === markStyle, fn: function () {
          setMarkStyle(s.id);
          setAyahMark(true);
        }
      };
    });
    items.push({ label: 'بدون تحديد', primary: !ayahMark, fn: function () { setAyahMark(false); } });
    Panels.menu('شكل تحديد الآية', items);
  }

  function toggleAyahMark() {
    setAyahMark(!ayahMark);
    toast(ayahMark ? 'تم تفعيل تحديد الآية' : 'تم إخفاء تحديد الآية');
  }

  function openSize() {
    var labels = { 15: 'صفحة كاملة (١٥ سطراً)', 12: 'كبير (١٢ سطراً)', 9: 'أكبر (٩ أسطر)', 7: 'كبير جداً (٧ أسطر)', 5: 'أقصى تكبير (٥ أسطر)' };
    Panels.menu('حجم الخط', SIZES.map(function (n) {
      return {
        label: labels[n], primary: n === Mushaf.perScreen(), fn: function () {
          Store.write('perScreen', n);
          Mushaf.setPerScreen(n);
        }
      };
    }), { text: 'تبقى فواصل الأسطر الحقيقية، ويتحرك العرض مع الآية داخل الصفحة.' });
  }

  function goTo(g) {
    exitWordMode();
    clearRootsSilently();
    Mushaf.show(g);
  }

  function clearRootsSilently() {
    markedRoots = null;
    Mushaf.setRoots(null);
  }

  function openIndex(title) {
    Panels.index(goTo, { title: title });
  }

  function openSearch(surah) {
    var cur = Mushaf.current().g;
    var target = surah || D.ayahOf(cur).surah;
    Panels.ayahSearch(target, cur, {
      pick: goTo,
      otherSurah: function () {
        Panels.index(function (g) { openSearch(D.ayahOf(g).surah); }, { title: 'البحث في أي سورة؟' });
      }
    });
  }

  function openMap() {
    Panels.map({
      juz: function (j, redraw) {
        var r = D.juzRange(j);
        var done = Khatma.countRange(r[0], r[1]) === r[1] - r[0] + 1;
        Panels.menu('الجزء ' + D.digits(j), [
          { label: 'الانتقال إلى هذا الجزء', primary: true, fn: function () { Panels.closeAll(); goTo(r[0]); } },
          { label: done ? 'إلغاء اكتماله' : 'تعليمه مكتملاً', fn: function () { Khatma.setRange(r[0], r[1], !done); redraw(); } },
          { label: 'رجوع', fn: function () {} }
        ]);
      },
      reset: function (redraw) {
        Panels.menu('تصفير الختمة؟', [
          { label: 'لا، رجوع', primary: true, fn: function () {} },
          { label: 'نعم، احذف كل ما حُفظ من التقدم', fn: function () { Khatma.reset(); redraw(); } }
        ], { text: 'لا يمكن التراجع عن هذا.' });
      }
    });
  }

  function openFinish() {
    var cur = Mushaf.current();
    var read = session.read;
    var juzDone = 0;
    for (var j = 1; j <= 30; j++) {
      var r = D.juzRange(j);
      if (Khatma.countRange(r[0], r[1]) === r[1] - r[0] + 1) juzDone++;
    }
    function label(g) {
      var a = D.ayahOf(g);
      return a.surah.name + ' ' + D.digits(a.ayah);
    }
    Panels.finish({
      ayahs: read.length,
      pages: session.pages.length,
      minutes: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
      from: read.length ? label(Math.min.apply(null, read)) : '',
      to: read.length ? label(Math.max.apply(null, read)) : '',
      at: Panels.ayahTitle(cur.g),
      percent: Khatma.total() / Khatma.TOTAL * 100,
      juzDone: juzDone
    }, {
      restart: function () {
        newSession(Mushaf.current().g);
        toast('بدأت جلسة جديدة');
      }
    });
  }

  function openActions() {
    var g = Mushaf.current().g;
    Panels.menu(Panels.ayahTitle(g), [
      { label: 'تفسير الآية', primary: true, fn: function () { Panels.tafsir(g); } },
      { label: 'اختيار كلمة من الآية', fn: enterWordMode },
      { label: 'تمييز جذور الآية في السورة', fn: function () { markAyahRoots(g); } },
      { label: 'البحث عن آية في السورة', fn: function () { openSearch(); } },
      { label: 'الفهرس: سورة أو جزء', fn: function () { openIndex(); } },
      { label: 'خريطة الختمة', fn: openMap },
      { label: 'حجم الخط', fn: openSize },
      { label: 'شكل تحديد الآية', fn: openMarkStyle },
      { label: 'وضع الألوان', fn: openTheme },
      { label: 'إنهاء الجلسة', fn: openFinish }
    ]);
  }

  var ACTIONS = {
    tafsir: function () { Panels.tafsir(Mushaf.current().g); },
    index: function () { openIndex(); },
    search: function () { openSearch(); },
    map: openMap,
    size: openSize,
    mark: openMarkStyle,
    theme: openTheme,
    finish: openFinish
  };

  /* ───────── زر الرجوع في الريموت ───────── */

  // حالة حارسة في السجل كي لا يغادر زر الرجوع الموقع وسط الجلسة بضغطة خطأ
  function guardHistory() {
    try { history.pushState({ guard: 1 }, ''); } catch (e) { /* غير متاح في بعض سياقات file:// */ }
  }

  var lastBack = 0;
  function onRootBack() {
    if (wordMode) {
      exitWordMode();
    } else if (!clearRoots()) {
      if (Date.now() - lastBack < 2500) {
        history.back();
        return;
      }
      lastBack = Date.now();
      toast('اضغط رجوع مرة أخرى لمغادرة الموقع');
    }
    guardHistory();
  }

  /* ───────── المفاتيح ───────── */

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (Panels.isOpen()) {
      if (Panels.key(e)) e.preventDefault();
      return;
    }
    var k = e.key;
    if (wordMode) {
      if (k === 'ArrowLeft' || k === 'ArrowDown') moveWord(1);
      else if (k === 'ArrowRight' || k === 'ArrowUp') moveWord(-1);
      else if (k === 'Enter') {
        var c = wordMode.list[wordMode.at];
        openWord(c.g, c.i);
      } else if (k === 'Escape' || k === 'GoBack' || k === 'Backspace') exitWordMode();
      else return;
      e.preventDefault();
      return;
    }
    switch (k) {
      // المصحف يُقرأ من اليمين: السهم الأيسر هو التالي
      case 'ArrowLeft': case 'ArrowDown': case 'PageDown': case ' ':
      case 'MediaTrackNext': case 'ChannelDown':
        Mushaf.next();
        break;
      case 'ArrowRight': case 'ArrowUp': case 'PageUp':
      case 'MediaTrackPrevious': case 'ChannelUp':
        Mushaf.prev();
        break;
      case 'Enter':
        openActions();
        break;
      case 'Escape':
        if (!clearRoots()) return;
        break;
      case 'ContextMenu': case 'm': case 'م':
        openActions();
        break;
      case 'i': case 'ف':
        openIndex();
        break;
      case 's': case '/': case 'س':
        openSearch();
        break;
      case 't': case 'ت':
        Panels.tafsir(Mushaf.current().g);
        break;
      case 'd': case 'ي':
        nextTheme();
        break;
      case 'h':
        toggleAyahMark();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /* ───────── البداية ───────── */

  function start() {
    var savedTheme = Store.read('theme', 'dark');
    var knownTheme = THEMES.some(function (t) { return t.id === savedTheme; });
    document.documentElement.setAttribute('data-theme', knownTheme ? savedTheme : 'dark');
    syncThemeColor();
    Khatma.load();
    Panels.init();
    Panels.onBack = onRootBack;
    guardHistory();
    Mushaf.init({
      onMove: onMove,
      onAdvance: onAdvance,
      onWord: openWord,
      onAyah: function (g) { Panels.tafsir(g); },
      onLongWord: function (g, i) {
        var w = Mushaf.findWord(g, i);
        if (w && w[3] >= 0) markRoot(g, w[3]);
        else toast('لا جذر لهذه الكلمة');
      },
      onLongAyah: markAyahRoots
    });
    setAyahMark(Store.read('ayahMark', true));
    var savedStyle = Store.read('markStyle', 'frame');
    setMarkStyle(MARK_STYLES.some(function (s) { return s.id === savedStyle; }) ? savedStyle : 'frame');
    var per = Store.read('perScreen', 9);
    if (SIZES.indexOf(per) >= 0) Mushaf.setPerScreen(per);

    document.querySelector('.bar-actions').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      b.blur();
      if (ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act]();
    });
    document.querySelector('.nav-next').addEventListener('click', function (e) {
      e.currentTarget.blur();
      Mushaf.next();
    });
    document.querySelector('.nav-prev').addEventListener('click', function (e) {
      e.currentTarget.blur();
      Mushaf.prev();
    });
    // نبضة واحدة من العجلة آية واحدة، وتتابع نبضات الدورة الواحدة لا يقفز آيات
    var lastWheel = 0;
    document.getElementById('stage').addEventListener('wheel', function (e) {
      e.preventDefault();
      var now = Date.now();
      if (now - lastWheel < WHEEL_GAP || !e.deltaY) return;
      lastWheel = now;
      if (e.deltaY > 0) Mushaf.next();
      else Mushaf.prev();
    }, { passive: false });
    document.addEventListener('keydown', onKey);
    var timer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(Mushaf.relayout, 150);
    });

    var pos = Store.read('pos', null);
    // الوقوف على أول آية بلا قراءة ليس موضعاً يستحق السؤال عنه
    var saved = pos && pos.g > 0 && pos.g < D.ayahCount ? pos : null;
    var ready = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('40px UthmanicHafs', 'بِسۡمِ'), document.fonts.ready])
      : Promise.resolve();
    function begin() {
      document.getElementById('loading').hidden = true;
      Mushaf.show(saved ? saved.g : 0, saved ? saved.page : undefined);
      loadSession(Mushaf.current().g);
      if (saved) askResume(saved);
      else openIndex('بسم الله نبدأ: اختر موضع القراءة');
    }
    ready.then(begin, begin);
  }

  function askResume(pos) {
    var a = D.ayahOf(pos.g);
    var when = new Date(pos.at);
    var date = '';
    try {
      date = ' · ' + when.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (e) { /* التاريخ اختياري */ }
    Panels.menu('تريد الاستمرار من حيث توقفنا؟', [
      { label: 'نعم، نكمل', primary: true, fn: function () {} },
      { label: 'اختيار موضع آخر', fn: function () { openIndex(); } }
    ], { text: 'سورة ' + a.surah.name + '، الآية ' + D.digits(a.ayah) + date });
  }

  return { start: start };
})();

if (QD.ready) App.start();
else document.getElementById('loading').textContent = 'تعذر تحميل بيانات المصحف.';
