// عرض صفحة المصحف: الأسطر الحقيقية، النافذة المكبَّرة، التظليل والنقطة الذهبية.
var Mushaf = (function () {
  var D = QD;
  var LONG_PRESS = 550;
  var state = { page: 0, g: 0, top: 0, perScreen: 9, rowH: 0, font: 0 };
  var rowsEl, sheetEl, hlEl, dotEl, viewEl;
  var pageRows = [];
  var hooks = {};
  var marked = null;     // جذور مميَّزة
  var cursor = null;     // الكلمة المحددة في وضع الكلمات
  var press = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function isWordRow(row) {
    return row[0] !== 'S' && row[0] !== 'B';
  }

  function buildRow(row) {
    var div = el('div', 'row');
    if (row[0] === 'S') {
      div.className = 'row sura-row';
      var band = el('div', 'sura-band');
      band.appendChild(el('span', 'sura-name', 'سورة ' + D.surahs[row[1] - 1].name));
      div.appendChild(band);
      return div;
    }
    if (row[0] === 'B') {
      div.className = 'row basmala-row short';
      div.appendChild(el('span', 'basmala', D.basmala));
      return div;
    }
    row.forEach(function (w) {
      var s;
      if (w[1] === 0) {
        s = el('span', 'ayah-end', D.digits(D.ayahOf(w[0]).ayah));
      } else {
        s = el('span', 'word', w[2]);
        s.dataset.i = w[1];
        if (w[3] >= 0) s.dataset.r = w[3];
      }
      s.dataset.g = w[0];
      div.appendChild(s);
    });
    return div;
  }

  // أبعاد السطر والخط: أكبر خط يتسع فيه أعرض سطر ضمن عدد الأسطر المطلوب
  function fit() {
    var w = viewEl.clientWidth, h = viewEl.clientHeight;
    var n = pageRows.length;
    var per = Math.min(state.perScreen, n);
    var rowH = Math.floor(h / per);
    rowsEl.classList.add('measuring');
    rowsEl.style.fontSize = '100px';
    var widest = 0;
    var widths = [];
    var nodes = rowsEl.children;
    for (var i = 0; i < n; i++) {
      var wd = isWordRow(pageRows[i]) ? nodes[i].scrollWidth : 0;
      widths.push(wd);
      if (wd > widest) widest = wd;
    }
    rowsEl.classList.remove('measuring');
    var byHeight = rowH * 0.58;
    var byWidth = widest ? 100 * (w * 0.985) / widest : byHeight;
    var font = Math.floor(Math.min(byHeight, byWidth));
    state.rowH = rowH;
    state.font = font;
    rowsEl.style.fontSize = font + 'px';
    rowsEl.style.setProperty('--row-h', rowH + 'px');
    var full = Math.min(w, Math.ceil(widest * font / 100 * 1.05));
    sheetEl.style.width = full + 'px';
    for (var j = 0; j < n; j++) {
      // كل سطر يبدأ من اليمين ويمتد إلى الحافة، والقصير جداً يبقى عند اليمين.
      // صفحتا الفاتحة وأول البقرة موسطتان كما في المصحف الورقي
      var words = isWordRow(pageRows[j]);
      nodes[j].classList.toggle('short', !words || state.page <= 2);
      nodes[j].classList.toggle('tail', words && state.page > 2 && widths[j] < widest * 0.5);
    }
    sheetEl.style.height = rowH * n + 'px';
    // صفحة أقل من حجم النافذة تتوسط عمودياً
    sheetEl.style.marginTop = n < per ? Math.floor((h - rowH * n) / 2) + 'px' : '0';
  }

  function rowOfWord(g) {
    var first = -1, last = -1;
    pageRows.forEach(function (r, i) {
      if (!isWordRow(r)) return;
      for (var k = 0; k < r.length; k++) {
        if (r[k][0] === g) {
          if (first < 0) first = i;
          last = i;
          break;
        }
      }
    });
    return [first, last];
  }

  function maxTop() {
    return Math.max(0, pageRows.length - state.perScreen);
  }

  function clampTop(t) {
    return Math.max(0, Math.min(maxTop(), t));
  }

  function ensureVisible() {
    var r = rowOfWord(state.g);
    if (r[0] < 0) return;
    var first = r[0];
    // إظهار عنوان السورة والبسملة مع أول آية
    while (first > 0 && !isWordRow(pageRows[first - 1])) first--;
    var per = state.perScreen;
    var top = state.top;
    if (r[1] - first + 1 <= per) {
      if (first < top) top = first;
      else if (r[1] > top + per - 1) top = r[1] - per + 1;
    } else if (r[0] < top || r[0] > top + per - 1) {
      top = r[0];
    }
    state.top = clampTop(top);
  }

  function applyTop() {
    sheetEl.style.transform = 'translateY(' + (-state.top * state.rowH) + 'px)';
  }

  function drawHighlight() {
    var g = state.g;
    var spans = rowsEl.querySelectorAll('[data-g="' + g + '"]');
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.active'), function (s) { s.classList.remove('active'); });
    Array.prototype.forEach.call(spans, function (s) { s.classList.add('active'); });
    var rowH = state.rowH;
    var byRow = {};
    var rects = [];
    Array.prototype.forEach.call(spans, function (s) {
      // كل سطر مستطيل واحد، مهما اختلف ارتفاع الكلمة عن شارة الآية
      var row = Math.floor((s.offsetTop + s.offsetHeight / 2) / rowH);
      var r = byRow[row];
      if (!r) {
        r = byRow[row] = { row: row, left: s.offsetLeft, right: s.offsetLeft + s.offsetWidth };
        rects.push(r);
      } else {
        r.left = Math.min(r.left, s.offsetLeft);
        r.right = Math.max(r.right, s.offsetLeft + s.offsetWidth);
      }
    });
    var pool = hlEl.children;
    while (pool.length < rects.length) hlEl.appendChild(el('i'));
    for (var i = 0; i < pool.length; i++) {
      var b = pool[i], r = rects[i];
      if (!r) {
        b.style.opacity = 0;
        continue;
      }
      b.style.opacity = 1;
      b.style.top = r.row * rowH + rowH * 0.07 + 'px';
      b.style.height = rowH * 0.86 + 'px';
      b.style.left = r.left - 6 + 'px';
      b.style.width = r.right - r.left + 12 + 'px';
    }
    // النقطة عند بداية الآية، يمين أول كلمة
    var first = spans[0];
    if (first) {
      var size = Math.max(10, state.font * 0.2);
      dotEl.style.width = dotEl.style.height = size + 'px';
      var rowI = Math.floor((first.offsetTop + first.offsetHeight / 2) / rowH);
      var x = first.offsetLeft + first.offsetWidth - size * 0.4;
      var y = rowI * rowH + rowH * 0.07 - size * 0.25;
      dotEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      dotEl.style.opacity = 1;
    } else {
      dotEl.style.opacity = 0;
    }
  }

  function paintMarks() {
    var words = rowsEl.querySelectorAll('.word');
    Array.prototype.forEach.call(words, function (s) {
      var on = marked && s.dataset.r !== undefined && marked[s.dataset.r];
      s.classList.toggle('rootmark', !!on);
      s.classList.toggle('cursor', !!cursor && +s.dataset.g === cursor.g && +s.dataset.i === cursor.i);
    });
  }

  function renderPage(p) {
    state.page = p;
    pageRows = D.pages[p - 1];
    rowsEl.textContent = '';
    var frag = document.createDocumentFragment();
    pageRows.forEach(function (r) { frag.appendChild(buildRow(r)); });
    rowsEl.appendChild(frag);
    rowsEl.classList.remove('turn');
    void rowsEl.offsetWidth;
    rowsEl.classList.add('turn');
    fit();
    paintMarks();
  }

  function refresh() {
    ensureVisible();
    paint();
  }

  // بعد تمرير يدوي داخل آية طويلة لا تُعاد النافذة إلى بدايتها
  function paint() {
    applyTop();
    drawHighlight();
    if (hooks.onMove) hooks.onMove(state.g, state.page);
  }

  // يفتح الآية g على صفحتها
  function show(g, page) {
    state.g = g;
    var p = page || D.ayahPage[g];
    if (p !== state.page) {
      state.top = 0;
      renderPage(p);
    }
    refresh();
  }

  function setPerScreen(n) {
    state.perScreen = n;
    if (!state.page) return;
    fit();
    state.top = clampTop(state.top);
    refresh();
  }

  function relayout() {
    if (!state.page) return;
    fit();
    refresh();
  }

  function next() {
    var r = rowOfWord(state.g);
    var per = state.perScreen;
    // بقية آية طويلة خارج النافذة: تُكشف قبل الانتقال
    if (r[1] > state.top + per - 1) {
      state.top = clampTop(Math.min(r[1] - per + 1, state.top + Math.max(1, per - 2)));
      paint();
      return;
    }
    if (D.ayahLastPage[state.g] > state.page) {
      show(state.g, state.page + 1);
      return;
    }
    if (state.g + 1 >= D.ayahCount) return;
    var from = state.g;
    show(state.g + 1);
    if (hooks.onAdvance) hooks.onAdvance(from);
  }

  function prev() {
    var r = rowOfWord(state.g);
    var per = state.perScreen;
    if (r[0] < state.top) {
      state.top = clampTop(Math.max(r[0], state.top - Math.max(1, per - 2)));
      paint();
      return;
    }
    if (D.ayahPage[state.g] < state.page) {
      show(state.g, state.page - 1);
      return;
    }
    if (state.g > 0) show(state.g - 1);
  }

  function setRoots(map) {
    marked = map;
    paintMarks();
  }

  function setCursor(c) {
    cursor = c;
    paintMarks();
    if (c) {
      var s = rowsEl.querySelector('.word[data-g="' + c.g + '"][data-i="' + c.i + '"]');
      if (s) {
        var row = Math.floor((s.offsetTop + s.offsetHeight / 2) / state.rowH);
        if (row < state.top || row > state.top + state.perScreen - 1) {
          state.top = clampTop(row);
          applyTop();
        }
      }
    }
  }

  // كلمات الآية الحالية الظاهرة في هذه الصفحة، بالترتيب
  function wordsOfAyah() {
    return Array.prototype.map.call(rowsEl.querySelectorAll('.word[data-g="' + state.g + '"]'), function (s) {
      return { g: +s.dataset.g, i: +s.dataset.i };
    });
  }

  function findWord(g, i) {
    var res = null;
    D.pages[state.page - 1].forEach(function (r) {
      if (isWordRow(r)) r.forEach(function (w) { if (w[0] === g && w[1] === i) res = w; });
    });
    return res;
  }

  function bindPointer() {
    function target(e) {
      var t = e.target;
      return t && t.closest ? t.closest('.word,.ayah-end') : null;
    }
    rowsEl.addEventListener('pointerdown', function (e) {
      var t = target(e);
      if (!t) return;
      if (press) clearTimeout(press.timer);
      press = { t: t, fired: false, x: e.clientX, y: e.clientY };
      press.timer = setTimeout(function () {
        press.fired = true;
        if (t.classList.contains('word')) hooks.onLongWord(+t.dataset.g, +t.dataset.i);
        else hooks.onLongAyah(+t.dataset.g);
      }, LONG_PRESS);
    });
    rowsEl.addEventListener('pointermove', function (e) {
      if (press && (Math.abs(e.clientX - press.x) > 12 || Math.abs(e.clientY - press.y) > 12)) {
        clearTimeout(press.timer);
        press = null;
      }
    });
    rowsEl.addEventListener('pointerup', function () {
      if (!press) return;
      clearTimeout(press.timer);
      var p = press;
      press = null;
      if (p.fired) return;
      if (p.t.classList.contains('word')) hooks.onWord(+p.t.dataset.g, +p.t.dataset.i);
      else hooks.onAyah(+p.t.dataset.g);
    });
    rowsEl.addEventListener('pointercancel', function () {
      if (press) clearTimeout(press.timer);
      press = null;
    });
    rowsEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function init(h) {
    hooks = h;
    rowsEl = document.getElementById('rows');
    sheetEl = document.getElementById('sheet');
    hlEl = document.getElementById('hl');
    dotEl = document.getElementById('dot');
    viewEl = document.getElementById('viewport');
    bindPointer();
  }

  return {
    init: init, show: show, next: next, prev: prev, setPerScreen: setPerScreen, relayout: relayout,
    setRoots: setRoots, setCursor: setCursor, wordsOfAyah: wordsOfAyah, findWord: findWord,
    current: function () { return { g: state.g, page: state.page }; },
    perScreen: function () { return state.perScreen; }
  };
})();
