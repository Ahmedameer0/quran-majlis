// الحفظ المحلي: الموضع والإعدادات وما قُرئ من الختمة.
// كل قراءة وكتابة محمية، فالموقع يعمل وإن كان التخزين محجوباً.
var Store = (function () {
  var PREFIX = 'majlis.';

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* التخزين محجوب: يستمر الموقع بلا حفظ */ }
  }

  function remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch (e) { /* كما سبق */ }
  }

  return { read: read, write: write, remove: remove };
})();

// ما قُرئ من الآيات: بت لكل آية، يُحفظ كسلسلة ست-عشرية مختصرة.
var Khatma = (function () {
  var TOTAL = 6236;
  var bits = new Uint8Array(Math.ceil(TOTAL / 8));
  var count = 0;

  function load() {
    var hex = Store.read('read', '');
    for (var i = 0; i < bits.length && i * 2 < hex.length; i++) {
      bits[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
    }
    recount();
  }

  function recount() {
    count = 0;
    for (var g = 0; g < TOTAL; g++) if (has(g)) count++;
  }

  function has(g) {
    return (bits[g >> 3] >> (g & 7)) & 1;
  }

  function set(g, on) {
    var was = has(g);
    if (on) bits[g >> 3] |= 1 << (g & 7);
    else bits[g >> 3] &= ~(1 << (g & 7));
    if (was && !on) count--;
    if (!was && on) count++;
  }

  function save() {
    var out = '';
    for (var i = 0; i < bits.length; i++) out += ('0' + bits[i].toString(16)).slice(-2);
    Store.write('read', out);
  }

  function setRange(from, to, on) {
    for (var g = from; g <= to; g++) set(g, on);
    save();
  }

  function mark(g) {
    if (has(g)) return false;
    set(g, true);
    save();
    return true;
  }

  function reset() {
    bits.fill(0);
    count = 0;
    save();
  }

  function countRange(from, to) {
    var n = 0;
    for (var g = from; g <= to; g++) if (has(g)) n++;
    return n;
  }

  return {
    load: load, has: has, mark: mark, setRange: setRange, reset: reset, countRange: countRange,
    total: function () { return count; }, TOTAL: TOTAL
  };
})();
