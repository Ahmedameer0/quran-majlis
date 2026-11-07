// بيانات المصحف. الملفات سكربتات تستدعي هذه الدوال، فتُحمَّل حتى من file:// دون خادم.
var QD = (function () {
  var D = { ready: false };
  var loaded = {};
  var waiting = {};
  var tafsirs = {};

  D.TAFSIR_SOURCES = [
    { id: 'jawami', name: 'جوامع الجامع', author: 'الشيخ الطبرسي (ت 548هـ)', note: 'تفسير موجز' },
    { id: 'majma', name: 'مجمع البيان', author: 'الشيخ الطبرسي (ت 548هـ)', note: 'تفسير مفصّل' }
  ];

  D.init = function (raw) {
    D.surahs = raw.s.map(function (s, i) {
      return { id: i + 1, name: s[0], ayahs: s[1], type: s[2], page: s[3] };
    });
    D.juz = raw.j;
    D.roots = raw.r;
    D.lemmas = raw.l;
    D.basmala = raw.b;
    D.pages = raw.p;

    var start = [];
    var n = 0;
    D.surahs.forEach(function (s) { start.push(n); s.start = n; n += s.ayahs; });
    D.ayahCount = n;
    D.surahStart = start;

    // موضع كل آية في الصفحات، وكلماتها
    D.ayahPage = new Int16Array(n);
    D.ayahLastPage = new Int16Array(n);
    D.pageFirst = new Int16Array(605).fill(-1);
    D.pageLast = new Int16Array(605).fill(-1);
    D.pages.forEach(function (rows, pi) {
      var p = pi + 1;
      rows.forEach(function (row) {
        if (row[0] === 'S' || row[0] === 'B') return;
        row.forEach(function (w) {
          var g = w[0];
          if (!D.ayahPage[g]) D.ayahPage[g] = p;
          D.ayahLastPage[g] = p;
          if (D.pageFirst[p] < 0) D.pageFirst[p] = g;
          D.pageLast[p] = g;
        });
      });
    });

    D.juzStart = D.juz.map(function (j) { return start[j[0] - 1] + j[1] - 1; });
    D.ready = true;
  };

  D.ayahOf = function (g) {
    var lo = 0, hi = D.surahs.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (D.surahStart[mid] <= g) lo = mid; else hi = mid - 1;
    }
    return { surah: D.surahs[lo], ayah: g - D.surahStart[lo] + 1 };
  };

  D.gidOf = function (surahId, ayah) {
    return D.surahStart[surahId - 1] + ayah - 1;
  };

  D.juzOf = function (g) {
    var j = 29;
    while (j > 0 && D.juzStart[j] > g) j--;
    return j + 1;
  };

  D.juzRange = function (j) {
    return [D.juzStart[j - 1], j < 30 ? D.juzStart[j] - 1 : D.ayahCount - 1];
  };

  D.digits = function (n) {
    return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  };

  D.normalize = function (s) {
    return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  };

  // هيكل الرسم بلا حروف العلة: «الصلاة» تطابق رسم المصحف «الصلوة»
  D.skeleton = function (s) {
    return D.normalize(s).replace(/[^ء-ي ]|[اويءئؤ]/g, '').replace(/ +/g, ' ').trim();
  };

  // آيات السورة جاهزة للبحث، تُبنى مرة لكل سورة
  D.surahAyahs = function (surah) {
    if (surah.search) return surah.search;
    var list = [];
    for (var a = 0; a < surah.ayahs; a++) list.push({ g: surah.start + a, n: a + 1, words: [] });
    var last = surah.start + surah.ayahs - 1;
    for (var p = surah.page; p <= 604 && D.pageFirst[p] <= last; p++) {
      D.pages[p - 1].forEach(function (row) {
        if (row[0] === 'S' || row[0] === 'B') return;
        row.forEach(function (w) {
          if (w[1] && w[0] >= surah.start && w[0] <= last) list[w[0] - surah.start].words.push(w[2]);
        });
      });
    }
    list.forEach(function (it) {
      it.text = it.words.join(' ');
      it.norm = ' ' + D.normalize(it.text) + ' ';
      it.skel = ' ' + D.skeleton(it.text) + ' ';
    });
    surah.search = list;
    return list;
  };

  // البحث برقم الآية أو بنصها؛ المطابقة الحرفية تتقدم على مطابقة الرسم
  D.searchAyahs = function (surah, query) {
    var list = D.surahAyahs(surah);
    var q = query.trim().replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
    if (!q) return list;
    if (/^\d+$/.test(q)) {
      var n = +q;
      return list.filter(function (it) { return it.n === n; })
        .concat(list.filter(function (it) { return it.n !== n && String(it.n).indexOf(q) === 0; }));
    }
    var norm = D.normalize(q), skel = D.skeleton(q);
    if (!skel) return [];
    var exact = list.filter(function (it) { return it.norm.indexOf(norm) >= 0; });
    var close = list.filter(function (it) { return it.norm.indexOf(norm) < 0 && it.skel.indexOf(skel) >= 0; });
    return exact.concat(close);
  };

  function loadScript(src, done, fail) {
    var el = document.createElement('script');
    el.src = src;
    el.onload = done;
    el.onerror = fail;
    document.head.appendChild(el);
  }

  function once(key, src) {
    return new Promise(function (resolve, reject) {
      if (loaded[key]) return resolve();
      if (waiting[key]) return waiting[key].push(resolve);
      waiting[key] = [resolve];
      loadScript(src, function () {
        loaded[key] = true;
        var list = waiting[key];
        delete waiting[key];
        list.forEach(function (r) { r(); });
      }, function () {
        delete waiting[key];
        reject(new Error('تعذر تحميل ' + src));
      });
    });
  }

  D.tafsir = function (source, surah, rows) { tafsirs[source + surah] = rows; };
  D.loadTafsir = function (source, surahId) {
    var name = ('00' + surahId).slice(-3);
    return once('t' + source + surahId, 'data/tafsir/' + source + '/' + name + '.js').then(function () {
      return tafsirs[source + surahId] || [];
    });
  };

  D.lexicon = function (entries) { D.lexEntries = entries; };
  D.loadLexicon = function () { return once('lex', 'data/lexicon.js?v=6'); };

  // عدّادات التكرار تُحسب مرة واحدة عند أول حاجة إليها
  D.counts = function () {
    if (D._counts) return D._counts;
    var form = {}, lemma = {}, root = {};
    D.pages.forEach(function (rows) {
      rows.forEach(function (row) {
        if (row[0] === 'S' || row[0] === 'B') return;
        row.forEach(function (w) {
          if (!w[1]) return;
          var f = D.normalize(w[2]);
          form[f] = (form[f] || 0) + 1;
          if (w[3] >= 0) root[w[3]] = (root[w[3]] || 0) + 1;
          if (w[4] >= 0) lemma[w[4]] = (lemma[w[4]] || 0) + 1;
        });
      });
    });
    D._counts = { form: form, lemma: lemma, root: root };
    return D._counts;
  };

  // عدد مواضع جذر داخل سورة
  D.rootInSurah = function (surah, rootId) {
    var n = 0, last = surah.start + surah.ayahs - 1;
    for (var p = surah.page; p <= 604 && D.pageFirst[p] <= last; p++) {
      D.pages[p - 1].forEach(function (row) {
        if (row[0] === 'S' || row[0] === 'B') return;
        row.forEach(function (w) {
          if (w[1] && w[3] === rootId && w[0] >= surah.start && w[0] <= last) n++;
        });
      });
    }
    return n;
  };

  return D;
})();
