// النوافذ المنبثقة. كل عنصر تفاعلي يُبلغ بأسهم الريموت وزر OK وحدها.
var Panels = (function () {
  var D = QD;
  var stack = [];
  var overlay;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function btn(label, fn, cls) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button,input,[tabindex="0"]'),
      function (e) { return !e.disabled && e.offsetParent !== null; }
    );
  }

  // أقرب عنصر في اتجاه السهم
  function moveFocus(root, dir) {
    var list = focusables(root);
    var cur = document.activeElement;
    if (list.indexOf(cur) < 0) {
      if (list[0]) list[0].focus();
      return !!list[0];
    }
    var a = cur.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (e) {
      if (e === cur) return;
      var b = e.getBoundingClientRect();
      var dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      var along, across;
      if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      if (dir === 'right') { along = dx; across = Math.abs(dy); }
      if (dir === 'up') { along = -dy; across = Math.abs(dx); }
      if (dir === 'down') { along = dy; across = Math.abs(dx); }
      if (along <= 2) return;
      var score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = e; }
    });
    if (best) {
      best.focus();
      if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' });
      return true;
    }
    return false;
  }

  function push(node, opts) {
    opts = opts || {};
    var entry = { node: node, opts: opts, back: document.activeElement };
    var wrap = el('div', 'panel ' + (opts.cls || ''));
    wrap.setAttribute('role', 'dialog');
    wrap.appendChild(node);
    entry.wrap = wrap;
    overlay.appendChild(wrap);
    overlay.hidden = false;
    stack.push(entry);
    try { history.pushState({ panel: stack.length }, ''); } catch (e) { /* file:// في بعض المتصفحات */ }
    var first = wrap.querySelector('[data-autofocus]') || focusables(wrap)[0];
    if (first) first.focus();
    return entry;
  }

  function drop() {
    var entry = stack.pop();
    if (!entry) return;
    overlay.removeChild(entry.wrap);
    if (!stack.length) {
      overlay.hidden = true;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    } else {
      var top = stack[stack.length - 1];
      var f = focusables(top.wrap)[0];
      if (entry.back && top.wrap.contains(entry.back)) entry.back.focus();
      else if (f) f.focus();
    }
    if (entry.opts.onClose) entry.opts.onClose();
  }

  // زر الرجوع في الريموت يعمل عبر سجل المتصفح
  function close() {
    if (!stack.length) return;
    var depth = stack.length;
    drop();
    try {
      skipPop++;
      history.back();
    } catch (e) { skipPop--; }
    return depth;
  }

  var skipPop = 0;
  function onPop() {
    if (skipPop > 0) { skipPop--; return; }
    if (stack.length) drop();
    else if (api.onBack) api.onBack();
  }

  function closeAll() {
    while (stack.length) close();
  }

  function key(e) {
    if (!stack.length) return false;
    var top = stack[stack.length - 1];
    var k = e.key;
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || k === 'Backspace' && document.activeElement.tagName !== 'INPUT') {
      close();
      return true;
    }
    if (top.opts.keys && top.opts.keys(e)) return true;
    var dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    if (dirs[k]) {
      if (moveFocus(top.wrap, dirs[k])) return true;
      var sc = top.wrap.querySelector('.scroll');
      if (sc && (k === 'ArrowUp' || k === 'ArrowDown')) {
        sc.scrollBy({ top: (k === 'ArrowDown' ? 1 : -1) * sc.clientHeight * 0.7, behavior: 'smooth' });
      }
      return true;
    }
    return false;
  }

  /* ───────── الشاشات ───────── */

  function ayahTitle(g) {
    var a = D.ayahOf(g);
    return 'سورة ' + a.surah.name + ' · الآية ' + D.digits(a.ayah);
  }

  function menu(title, items, opts) {
    var box = el('div', 'menu');
    box.appendChild(el('h2', 'panel-title', title));
    if (opts && opts.text) box.appendChild(el('p', 'panel-text', opts.text));
    var list = el('div', 'menu-list');
    items.forEach(function (it) {
      list.appendChild(btn(it.label, function () {
        if (!it.keep) close();
        it.fn();
      }, it.primary ? 'primary' : ''));
    });
    box.appendChild(list);
    return push(box, { cls: 'panel-small', onClose: opts && opts.onClose });
  }

  /* الفهرس */
  function index(onPick, opts) {
    opts = opts || {};
    var box = el('div', 'index');
    var title = el('h2', 'panel-title', opts.title || 'اختر موضع القراءة');
    box.appendChild(title);
    var tabs = el('div', 'tabs');
    var bSurah = btn('السور', function () { tab('s'); });
    var bJuz = btn('الأجزاء', function () { tab('j'); });
    tabs.appendChild(bSurah);
    tabs.appendChild(bJuz);
    var search = el('input', 'search');
    search.type = 'search';
    search.placeholder = 'ابحث باسم السورة…';
    search.setAttribute('aria-label', 'ابحث باسم السورة');
    tabs.appendChild(search);
    box.appendChild(tabs);
    var grid = el('div', 'grid scroll');
    box.appendChild(grid);

    function pick(g) {
      close();
      onPick(g);
    }

    function drawSurahs() {
      var q = D.normalize(search.value);
      grid.textContent = '';
      grid.className = 'grid scroll surah-grid';
      D.surahs.forEach(function (s) {
        if (q && D.normalize(s.name).indexOf(q) < 0 && String(s.id) !== q) return;
        var b = btn('', function () { pick(s.start); }, 'cell');
        b.appendChild(el('span', 'cell-num', D.digits(s.id)));
        b.appendChild(el('span', 'cell-name', s.name));
        b.appendChild(el('span', 'cell-sub', D.digits(s.ayahs) + ' آية · ' + s.type));
        grid.appendChild(b);
      });
      if (!grid.children.length) grid.appendChild(el('p', 'empty', 'لا توجد سورة بهذا الاسم'));
    }

    function drawJuz() {
      grid.textContent = '';
      grid.className = 'grid scroll juz-grid';
      for (var j = 1; j <= 30; j++) {
        (function (j) {
          var b = btn('', function () { pick(D.juzStart[j - 1]); }, 'cell');
          var start = D.ayahOf(D.juzStart[j - 1]);
          b.appendChild(el('span', 'cell-num', D.digits(j)));
          b.appendChild(el('span', 'cell-name', 'الجزء ' + D.digits(j)));
          b.appendChild(el('span', 'cell-sub', start.surah.name + ' ' + D.digits(start.ayah)));
          grid.appendChild(b);
        })(j);
      }
    }

    function tab(t) {
      bSurah.classList.toggle('on', t === 's');
      bJuz.classList.toggle('on', t === 'j');
      search.hidden = t !== 's';
      if (t === 's') drawSurahs(); else drawJuz();
    }

    search.addEventListener('input', drawSurahs);
    tab('s');
    push(box, {
      cls: 'panel-wide',
      keys: function (e) {
        if (e.key === 'Enter' && document.activeElement === search) {
          var f = grid.querySelector('button');
          if (f) f.focus();
          return true;
        }
        return false;
      }
    });
    var first = grid.querySelector('button');
    if (first) first.focus();
  }

  /* إعدادات الخط: تُطبَّق فوراً وتبقى النافذة مفتوحة */
  function fontSettings(groups) {
    var box = el('div', 'menu');
    box.appendChild(el('h2', 'panel-title', 'إعدادات الخط'));
    groups.forEach(function (g) {
      box.appendChild(el('h3', 'tafsir-sec', g.title));
      var row = el('div', 'tabs');
      var buttons = g.items.map(function (it) {
        var b = btn(it.label, function () {
          buttons.forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          it.fn();
        });
        b.classList.toggle('on', it.on);
        row.appendChild(b);
        return b;
      });
      box.appendChild(row);
    });
    box.appendChild(btn('إغلاق', close));
    push(box, { cls: 'panel-mid' });
  }

  /* البحث عن آية داخل سورة */
  function ayahSearch(surah, current, actions) {
    var box = el('div', 'index');
    box.appendChild(el('h2', 'panel-title', 'البحث في سورة ' + surah.name));
    var tabs = el('div', 'tabs');
    var search = el('input', 'search');
    search.type = 'search';
    search.placeholder = 'رقم الآية أو كلمات منها…';
    search.setAttribute('aria-label', 'رقم الآية أو كلمات منها');
    tabs.appendChild(search);
    tabs.appendChild(btn('سورة أخرى', function () { close(); actions.otherSurah(); }));
    box.appendChild(tabs);
    var count = el('p', 'tafsir-range');
    box.appendChild(count);
    var list = el('div', 'ayah-list scroll');
    box.appendChild(list);

    // تمييز كلمات البحث داخل نص الآية
    function drawWords(parent, item, parts) {
      item.words.forEach(function (w, i) {
        if (i) parent.appendChild(document.createTextNode(' '));
        var sk = D.skeleton(w);
        var hit = parts.some(function (p) { return sk.indexOf(p) >= 0; });
        parent.appendChild(hit ? el('mark', '', w) : document.createTextNode(w));
      });
    }

    function draw() {
      var q = search.value.trim();
      var found = D.searchAyahs(surah, q);
      var isNumber = /^[\d٠-٩]+$/.test(q);
      var parts = q && !isNumber ? D.skeleton(q).split(' ').filter(Boolean) : [];
      list.textContent = '';
      count.textContent = q ? D.digits(found.length) + ' نتيجة' : D.digits(surah.ayahs) + ' آية';
      found.forEach(function (item) {
        var b = btn('', function () { close(); actions.pick(item.g); }, 'ayah-item');
        b.appendChild(el('span', 'ayah-end', D.digits(item.n)));
        var t = el('span', 'ayah-text');
        drawWords(t, item, parts);
        b.appendChild(t);
        if (item.g === current) b.dataset.current = '1';
        list.appendChild(b);
      });
      if (!found.length) list.appendChild(el('p', 'empty', 'لا توجد آية بهذا النص في السورة'));
    }

    search.addEventListener('input', draw);
    draw();
    push(box, {
      cls: 'panel-wide',
      keys: function (e) {
        var typing = document.activeElement === search;
        if (e.key === 'Enter' && typing) {
          var f = list.querySelector('button');
          if (f) f.focus();
          return true;
        }
        // الكتابة من أي مكان تذهب إلى خانة البحث، وأزرار الأرقام في الريموت كذلك
        if (!typing && e.key.length === 1 && e.key !== ' ') search.focus();
        return false;
      }
    });
    // يبدأ الريموت من الآية الحالية لا من خانة الكتابة
    var start = list.querySelector('[data-current]') || list.querySelector('button');
    if (start) {
      start.focus();
      start.scrollIntoView({ block: 'center' });
    }
  }

  /* التفسير */
  var tafsirSource = Store.read('tafsir', 'jawami');
  var SECTION_NAMES = {
    'النزول': 'سبب النزول', 'المعنى': 'المعنى', 'اللغة': 'اللغة', 'الاعراب': 'الإعراب',
    'القراءة': 'القراءات', 'الحجة': 'الحجة', 'النظم': 'النظم', 'القصة': 'القصة',
    'الاسناد': 'الإسناد', 'الفضل': 'الفضل', 'المشكل': 'المشكل'
  };

  // النص يُدرج عقداً نصية لا HTML، والآيات المقتبسة بين ﴿﴾ تُلوَّن
  function richText(parent, text) {
    text.split(/(﴿[^﴾]*﴾)/).forEach(function (part) {
      if (!part) return;
      if (part.charAt(0) === '﴿') parent.appendChild(el('span', 'quote', part));
      else parent.appendChild(document.createTextNode(part));
    });
  }

  // فقرة تبدأ بـ«قوله تعالى:» ثم مطلع من نص الآية
  function aboutAyah(para, ayahSkel) {
    var m = /^و?قوله(?: تعالى| عز وجل)?\s*:?\s*([^،,:.]{6,60})/.exec(para);
    if (!m) return false;
    // الاقتباس قد يتصل بالشرح بلا فاصلة، فيكفي مطلعه
    var quoted = D.skeleton(m[1]).replace(/ /g, '').slice(0, 10);
    return quoted.length >= 6 && ayahSkel.indexOf(quoted) >= 0;
  }

  function tafsir(g) {
    D.TAFSIR_SOURCES.sort(function (x, y) { return x.order - y.order; });
    // مصدر محفوظ قد لا يكون موجوداً في هذه النسخة من الموقع
    if (!D.TAFSIR_SOURCES.some(function (s) { return s.id === tafsirSource; })) tafsirSource = D.TAFSIR_SOURCES[0].id;
    var a = D.ayahOf(g);
    var box = el('div', 'tafsir');
    var head = el('div', 'tafsir-head');
    var title = el('h2', 'panel-title', 'تفسير ' + ayahTitle(g));
    head.appendChild(title);
    var tabs = el('div', 'tabs');
    var buttons = {};
    D.TAFSIR_SOURCES.forEach(function (src) {
      var b = btn(src.name, function () { load(src.id); });
      buttons[src.id] = b;
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    box.appendChild(head);
    var range = el('p', 'tafsir-range');
    box.appendChild(range);
    var body = el('div', 'tafsir-body scroll');
    box.appendChild(body);
    var foot = el('p', 'tafsir-source');
    box.appendChild(foot);

    function load(id) {
      tafsirSource = id;
      Store.write('tafsir', id);
      var src = D.TAFSIR_SOURCES.filter(function (s) { return s.id === id; })[0];
      D.TAFSIR_SOURCES.forEach(function (s) { buttons[s.id].classList.toggle('on', s.id === id); });
      body.textContent = '';
      range.textContent = '';
      body.appendChild(el('p', 'empty', 'جارٍ التحميل…'));
      foot.textContent = 'المصدر: ' + src.name + ' — ' + src.author;
      D.loadTafsir(id, a.surah.id).then(function (rows) {
        if (tafsirSource !== id) return;
        body.textContent = '';
        var row = rows.filter(function (r) { return r[0] <= a.ayah && a.ayah <= r[1]; })[0];
        var note = '';
        if (!row) {
          // آية لم يُفرد لها شرح في النسخة الرقمية: يُعرض المقطع الذي يليها
          row = rows.filter(function (r) { return r[0] > a.ayah; })[0];
          note = 'لم يُفرد لهذه الآية شرح في النسخة الرقمية، والمعروض شرح ما يليها. ';
        }
        if (!row) {
          body.appendChild(el('p', 'empty', 'لا يوجد شرح لهذه الآية في هذا المصدر.'));
          return;
        }
        if (row[0] !== row[1] || note) {
          range.textContent = note + 'شرح الآيات ' + D.digits(row[0]) + '–' + D.digits(row[1]) + ' معاً في المصدر';
        }
        var ayahSkel = D.skeleton(D.surahAyahs(a.surah)[a.ayah - 1].text).replace(/ /g, '');
        var target = null;
        row[2].forEach(function (sec) {
          if (sec[0]) body.appendChild(el('h3', 'tafsir-sec', SECTION_NAMES[sec[0]] || sec[0]));
          sec[1].split('\n').forEach(function (para) {
            var p = el('p', 'tafsir-text');
            richText(p, para);
            body.appendChild(p);
            if (!target && aboutAyah(para, ayahSkel)) target = p;
          });
        });
        body.scrollTop = 0;
        // المقطع يشرح آيات كثيرة: يبدأ العرض من فقرة هذه الآية
        if (target && row[0] !== row[1]) {
          target.classList.add('tafsir-here');
          body.scrollTop = target.offsetTop - body.offsetTop;
        }
      }, function () {
        body.textContent = '';
        body.appendChild(el('p', 'empty', 'تعذر تحميل ملف التفسير.'));
      });
    }

    push(box, {
      cls: 'panel-wide',
      keys: function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          body.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * body.clientHeight * 0.7, behavior: 'smooth' });
          return true;
        }
        return false;
      }
    });
    load(tafsirSource);
    buttons[tafsirSource].focus();
  }

  /* الكلمة */
  function word(ref, actions) {
    var w = ref.word;
    var box = el('div', 'wordcard');
    box.appendChild(el('div', 'wc-word', w[2]));
    box.appendChild(el('p', 'wc-where', ayahTitle(ref.g)));
    var scroll = el('div', 'wc-body scroll');
    box.appendChild(scroll);
    var counts = D.counts();
    var root = w[3] >= 0 ? D.roots[w[3]] : null;
    var lemma = w[4] >= 0 ? D.lemmas[w[4]] : null;

    var facts = el('div', 'wc-facts');
    function fact(label, value) {
      var f = el('div', 'wc-fact');
      f.appendChild(el('span', 'wc-label', label));
      f.appendChild(el('span', 'wc-value', value));
      facts.appendChild(f);
    }
    fact('الجذر', root ? root.split('').join(' ') : 'لا جذر له');
    if (lemma) fact('أصل اللفظ', lemma);
    var form = counts.form[D.normalize(w[2])] || 1;
    fact('تكررت هذه الكلمة', D.digits(form) + ' مرة في القرآن');
    if (root) fact('مشتقات الجذر', D.digits(counts.root[w[3]]) + ' موضعاً في القرآن');
    scroll.appendChild(facts);

    var meaning = el('div', 'wc-meaning');
    scroll.appendChild(meaning);

    D.loadLexicon().then(function () {
      var text = root ? D.lexEntries[w[3]] : null;
      if (text) {
        meaning.appendChild(el('h3', 'tafsir-sec', 'المعنى'));
        var p = el('p', 'tafsir-text');
        richText(p, text);
        meaning.appendChild(p);
        meaning.appendChild(el('p', 'wc-source', 'المصدر: مفردات ألفاظ القرآن — الراغب الأصفهاني (ت 502هـ)'));
      } else {
        meaning.appendChild(el('p', 'wc-source', root
          ? 'لا مدخل لهذا الجذر في نسخة المفردات الرقمية.'
          : 'حرف أو أداة أو اسم جامد لا مدخل له في المعجم.'));
      }
    }, function () {
      meaning.appendChild(el('p', 'wc-source', 'تعذر تحميل المعجم.'));
    });

    var row = el('div', 'wc-actions');
    row.appendChild(btn('تفسير الآية', function () { close(); actions.tafsir(ref.g); }, 'primary'));
    if (root) {
      row.appendChild(btn('تمييز الجذر في السورة', function () { close(); actions.root(ref.g, w[3]); }));
    }
    row.appendChild(btn('إغلاق', close));
    box.appendChild(row);
    push(box, {
      cls: 'panel-mid',
      keys: function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          scroll.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * scroll.clientHeight * 0.7, behavior: 'smooth' });
          return true;
        }
        return false;
      }
    });
  }

  /* خريطة الختمة */
  function map(actions) {
    var box = el('div', 'khatma');
    box.appendChild(el('h2', 'panel-title', 'خريطة الختمة'));
    var summary = el('div', 'km-summary');
    var pct = el('div', 'km-pct');
    var sub = el('div', 'km-sub');
    var bar = el('div', 'km-bar');
    var fill = el('i');
    bar.appendChild(fill);
    summary.appendChild(pct);
    summary.appendChild(sub);
    summary.appendChild(bar);
    box.appendChild(summary);
    var grid = el('div', 'km-grid');
    box.appendChild(grid);
    var cells = [];
    for (var j = 1; j <= 30; j++) {
      (function (j) {
        var b = btn('', function () { actions.juz(j, draw); }, 'km-cell');
        b.appendChild(el('i', 'km-fill'));
        b.appendChild(el('span', 'km-n', D.digits(j)));
        b.appendChild(el('span', 'km-p'));
        cells.push(b);
        grid.appendChild(b);
      })(j);
    }

    function draw() {
      var total = Khatma.total();
      var done = 0;
      cells.forEach(function (b, i) {
        var r = D.juzRange(i + 1);
        var size = r[1] - r[0] + 1;
        var n = Khatma.countRange(r[0], r[1]);
        var ratio = n / size;
        if (n === size) done++;
        b.classList.toggle('done', n === size);
        b.classList.toggle('started', n > 0 && n < size);
        b.querySelector('.km-fill').style.height = ratio * 100 + '%';
        b.querySelector('.km-p').textContent = n === size ? 'اكتمل' : n ? D.digits(Math.floor(ratio * 100)) + '٪' : '';
      });
      var percent = total / Khatma.TOTAL * 100;
      pct.textContent = D.digits(percent.toFixed(percent < 10 && percent > 0 ? 1 : 0)).replace('.', '٫') + '٪';
      sub.textContent = 'اكتمل ' + D.digits(done) + ' من ٣٠ جزءاً · قُرئت ' + D.digits(total) + ' آية من ' + D.digits(Khatma.TOTAL);
      fill.style.width = percent + '%';
    }

    var foot = el('div', 'km-foot');
    foot.appendChild(btn('إغلاق', close));
    foot.appendChild(btn('تصفير الختمة', function () { actions.reset(draw); }));
    box.appendChild(foot);
    draw();
    push(box, { cls: 'panel-wide' });
  }

  /* خاتمة الليلة */
  function finish(s, actions) {
    var box = el('div', 'finish');
    box.appendChild(el('div', 'finish-orn', '۞'));
    box.appendChild(el('h2', 'finish-title', 'خاتمة الليلة'));
    box.appendChild(el('p', 'finish-dua', 'تقبّل الله منّا ومنكم صالح الأعمال'));
    var stats = el('div', 'finish-stats');
    function stat(value, label) {
      var d = el('div', 'stat');
      d.appendChild(el('span', 'stat-v', value));
      d.appendChild(el('span', 'stat-l', label));
      stats.appendChild(d);
    }
    stat(D.digits(s.ayahs), 'آية قُرئت الليلة');
    stat(D.digits(s.pages), s.pages === 1 ? 'صفحة' : 'صفحات');
    stat(D.digits(s.minutes), 'دقيقة');
    box.appendChild(stats);
    if (s.from) box.appendChild(el('p', 'finish-range', 'من ' + s.from + ' إلى ' + s.to));
    box.appendChild(el('p', 'finish-range', 'الموضع الحالي: ' + s.at));
    var bar = el('div', 'km-bar');
    var fill = el('i');
    fill.style.width = s.percent + '%';
    bar.appendChild(fill);
    box.appendChild(bar);
    box.appendChild(el('p', 'finish-range', 'أُنجز من الختمة ' + D.digits(s.percent.toFixed(1)).replace('.', '٫') + '٪ · اكتمل ' + D.digits(s.juzDone) + ' من ٣٠ جزءاً'));
    var foot = el('div', 'wc-actions');
    foot.appendChild(btn('جلسة جديدة', function () { close(); actions.restart(); }, 'primary'));
    foot.appendChild(btn('متابعة القراءة', close));
    box.appendChild(foot);
    push(box, { cls: 'panel-mid' });
  }

  function init() {
    overlay = document.getElementById('overlay');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    window.addEventListener('popstate', onPop);
  }

  var api = {
    init: init, close: close, closeAll: closeAll, key: key, menu: menu, index: index, tafsir: tafsir,
    ayahSearch: ayahSearch, fontSettings: fontSettings,
    word: word, map: map, finish: finish,
    isOpen: function () { return stack.length > 0; },
    ayahTitle: ayahTitle
  };
  return api;
})();
