// Formula/source review of eight previously untested calculators.
// Runs each tool's real inline script against a small DOM model and checks
// results against independent oracles written from first principles.
//   node test-formula-review.cjs            (all tools)
//   node test-formula-review.cjs unit-converter percentage-calculator
// --root=DIR (or TN_ROOT) points the suite at another copy of tools/ (e.g. the baseline).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('node:assert/strict');
const rootArg = process.argv.find(a => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice(7)) : (process.env.TN_ROOT || __dirname);

/* ------------------------------ DOM model ------------------------------ */
function attrsOf(s) {
  const a = {};
  for (const m of s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] === undefined ? '' : m[2];
  return a;
}
function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→').replace(/&amp;/g, '&');
}
function parseOptions(s) {
  return [...s.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(m => {
    const a = attrsOf(m[1]);
    return { value: 'value' in a ? a.value : decode(m[2]), selected: 'selected' in a };
  });
}
class El {
  constructor(tag, attrs, inner) {
    this.tag = tag; this.attrs = attrs; this.id = attrs.id; this.listeners = {}; this.style = {};
    this.className = attrs.class || ''; this._html = ''; this._text = ''; this.checked = 'checked' in attrs;
    this.dataset = {};
    if (tag === 'select') this._setOptions(inner || '');
    else if (tag === 'textarea') this._value = decode(inner || '');
    else this._value = attrs.value || '';
  }
  _setOptions(s) {
    this.options = parseOptions(s);
    const i = this.options.findIndex(o => o.selected);
    this.selectedIndex = this.options.length ? (i < 0 ? 0 : i) : -1;   // browsers select the first option
  }
  get value() { return this.tag === 'select' ? (this.selectedIndex >= 0 ? this.options[this.selectedIndex].value : '') : this._value; }
  set value(v) { v = String(v); if (this.tag === 'select') this.selectedIndex = this.options.findIndex(o => o.value === v); else this._value = v; }
  get innerHTML() { return this._html; }
  set innerHTML(s) { this._html = String(s); this._text = ''; if (this.tag === 'select') this._setOptions(this._html); }
  get textContent() { return this._text; }
  set textContent(s) { this._text = String(s); this._html = ''; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type) { for (const fn of this.listeners[type] || []) fn({ target: this }); }
}
const cache = {};
function source(slug) {
  if (!cache[slug]) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', slug + '.html'), 'utf8');
    cache[slug] = { src, code: [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]) };
  }
  return cache[slug];
}
function tool(slug) {
  const { src, code } = source(slug), nodes = {};
  for (const m of src.matchAll(/<(input|select|textarea|div|span|p|button)\b([^>]*)>/g)) {
    const a = attrsOf(m[2]);
    if (!a.id) continue;
    assert.ok(!nodes[a.id], slug + ': duplicate id ' + a.id);
    let inner = '';
    if (m[1] === 'select' || m[1] === 'textarea') inner = src.slice(m.index + m[0].length).split('</' + m[1] + '>')[0];
    nodes[a.id] = new El(m[1], a, inner);
  }
  const document = {
    getElementById(id) { if (!(id in nodes)) throw new Error(slug + ': missing #' + id); return nodes[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  for (const c of code) vm.runInNewContext(c, { document, window: {} }, { timeout: 2000 });
  return {
    nodes,
    set(id, val) {
      const n = nodes[id];
      if (n.attrs.type === 'checkbox') n.checked = !!val; else n.value = val;
      n.fire('input'); n.fire('change');
      return this;
    },
    setAll(obj) { for (const [k, v] of Object.entries(obj)) this.set(k, v); return this; },
    html(id) { return nodes[id].innerHTML || nodes[id].textContent; },
    text(id) { return decode((nodes[id].innerHTML || nodes[id].textContent).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); },
    big(id) { const m = /class="result-big">([^<]*)</.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null; },
    kv(id, label) {
      const re = new RegExp('<span>(?:<strong>)?' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:</strong>)?</span><span class="v">(?:<strong>)?([^<]*)');
      const m = re.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null;
    }
  };
}

/* ------------------------------ helpers ------------------------------ */
// --soft (or SOFT=1) records every failing check instead of stopping at the first one per suite.
let checks = 0;
const SOFT = !!process.env.SOFT || process.argv.includes('--soft'), softFails = [];
function guard(fn, msg) { checks++; try { fn(); } catch (e) { if (!SOFT) throw e; softFails.push(String(msg || e.message).split('\n')[0]); } }
const ok = (c, msg) => guard(() => assert.ok(c, msg), msg);
const eq = (a, b, msg) => guard(() => assert.strictEqual(a, b, msg), (msg || '') + ' [got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ']');
const JUNK = /NaN|Infinity|undefined|∞|null/;
function clean(s, where) { ok(!JUNK.test(s), where + ': junk in output -> ' + s); }
// "1,234.5 g" -> 1234.5 ; "1.2E-20 kg" -> 1.2e-20 ; "$1,234.56" -> 1234.56
function numOf(s) { const m = /-?[\d,]*\.?\d+(?:E[-+]?\d+)?/i.exec(s.replace(/\$/g, '')); return m ? Number(m[0].replace(/,/g, '')) : NaN; }
const money2 = x => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x);
const money0 = x => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
// Deterministic PRNG so sweeps are reproducible.
let seed = 20260924;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/* ============================ unit-converter ============================ */
function unitConverter() {
  const S = 'unit-converter';
  // Exact definitions: international yard & pound (1959) and US gallon = 231 in^3.
  const IN = 0.0254, LB_G = 453.59237, IN3_ML = 16.387064;          // 2.54^3 = 16.387064 exactly
  const GAL_L = 231 * IN3_ML / 1000;                                  // 3.785411784 L
  ok(Math.abs(GAL_L - 3.785411784) < 1e-15, 'US gallon derivation');
  const REF = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 5280 * 12 * IN, yd: 36 * IN, ft: 12 * IN, in: IN },
    weight: { g: 1, kg: 1000, mg: 0.001, lb: LB_G, oz: LB_G / 16, tonne: 1e6 },
    volume: { l: 1, ml: 0.001, 'gal (US)': GAL_L, qt: GAL_L / 4, pt: GAL_L / 8, cup: GAL_L / 16, 'fl oz': GAL_L / 128 }
  };
  const t = tool(S);
  // default render (a real browser selects the first option after fill())
  eq(t.big('uc-out'), '0.001 km', 'default 1 m = 0.001 km');
  clean(t.html('uc-out'), 'default');

  const conv = (cat, from, to, val) => { t.set('uc-cat', cat).set('uc-from', from).set('uc-to', to).set('uc-val', String(val)); return t.big('uc-out'); };
  // Known everyday values (exact by definition)
  const known = [
    ['weight', 'lb', 'g', 1, '453.59237 g'], ['weight', 'tonne', 'lb', 1, '2,204.622622 lb'],
    ['weight', 'kg', 'oz', 1, '35.273962 oz'], ['weight', 'lb', 'oz', 1, '16 oz'],
    ['volume', 'gal (US)', 'l', 1, '3.785412 l'], ['volume', 'gal (US)', 'fl oz', 1, '128 fl oz'],
    ['volume', 'cup', 'fl oz', 1, '8 fl oz'], ['volume', 'l', 'fl oz', 1, '33.814023 fl oz'],
    ['length', 'mi', 'ft', 1, '5,280 ft'], ['length', 'in', 'cm', 1, '2.54 cm'],
    ['temperature', 'C', 'F', 100, '212 F'], ['temperature', 'C', 'F', -40, '-40 F'],
    ['temperature', 'F', 'C', 98.6, '37 C'], ['temperature', 'K', 'F', 0, '-459.67 F'],
    ['temperature', 'F', 'K', -459.67, '0 K'], ['temperature', 'C', 'K', -273.15, '0 K']
  ];
  for (const [c, f, to, v, want] of known) eq(conv(c, f, to, v), want, `${v} ${f} -> ${to}`);

  // Every pair, several magnitudes, against the exact-definition oracle
  for (const [cat, units] of Object.entries(REF)) for (const f of Object.keys(units)) for (const to of Object.keys(units)) {
    for (const v of [1, 2.5, 12345.678, 0.001, -3]) {
      const shown = conv(cat, f, to, v), want = v * units[f] / units[to], got = numOf(shown);
      clean(shown, `${cat} ${v} ${f}->${to}`);
      ok(shown.endsWith(' ' + to), 'unit label ' + shown);
      const tol = Math.abs(want) >= 1 ? 0.5e-6 + 1e-12 * Math.abs(want) : 5e-7 * Math.abs(want) + 1e-300;
      ok(Math.abs(got - want) <= tol, `${cat} ${v} ${f}->${to}: shown ${shown}, exact ${want}`);
    }
  }
  // Nonzero results must never display as "0"
  eq(numOf(conv('weight', 'mg', 'tonne', 1)), 1e-9, '1 mg = 1e-9 tonne, not 0');
  ok(numOf(conv('length', 'mm', 'mi', 1)) > 0, '1 mm in miles is not shown as 0');
  eq(conv('length', 'm', 'km', 0), '0 km', 'zero converts to zero');

  // Temperature: below absolute zero is physically invalid
  for (const [u, v] of [['K', -1], ['C', -273.16], ['F', -459.68], ['C', -1000]]) {
    conv('temperature', u, 'C', v);
    ok(/absolute zero/i.test(t.text('uc-out')), `rejects ${v} ${u} (below absolute zero) -> ` + t.text('uc-out'));
  }
  // Invalid / overflow input never renders NaN/Infinity/∞
  for (const bad of ['', 'abc', '1e309', '-1e309']) {
    conv('length', 'm', 'km', bad);
    ok(/Enter a/.test(t.text('uc-out')), 'prompt for ' + JSON.stringify(bad) + ' -> ' + t.text('uc-out'));
    clean(t.html('uc-out'), 'invalid ' + bad);
  }
  conv('weight', 'tonne', 'mg', 1e308);
  ok(/too large/i.test(t.text('uc-out')), 'overflow reported -> ' + t.text('uc-out'));
  clean(t.html('uc-out'), 'overflow');
}

/* ========================= percentage-calculator ========================= */
function percentage() {
  const S = 'percentage-calculator', t = tool(S);
  eq(t.text('p1-out'), '30', 'default 20% of 150');
  eq(t.text('p2-out'), '20%', 'default 30 of 150');
  eq(t.text('p3-out'), '+20% increase', 'default 150 -> 180');
  const p1 = (x, y) => t.setAll({ 'p1-x': x, 'p1-y': y }).text('p1-out');
  const p2 = (x, y) => t.setAll({ 'p2-x': x, 'p2-y': y }).text('p2-out');
  const p3 = (a, b) => t.setAll({ 'p3-a': a, 'p3-b': b }).text('p3-out');
  eq(p1('12.5', '80'), '10', '12.5% of 80');
  eq(p1('-10', '50'), '-5', 'negative percent');
  eq(p1('0.1', '0.3'), '0.0003', 'small product keeps digits');
  eq(p2('1', '3'), '33.3333%', '1 of 3');
  eq(p2('45', '60'), '75%', '45 of 60');
  eq(p3('150', '120'), '-20% decrease', 'decrease');
  eq(p3('-100', '-50'), '+50% increase', 'negative base uses |old| convention');
  eq(p3('80', '80'), '0% change', 'no change');
  ok(/non-zero starting/.test(p3('0', '5')), 'zero base refused');
  ok(/non-zero second/.test(p2('5', '0')), 'zero whole refused');
  // Blank inputs must prompt, not silently compute with 0
  ok(/Enter/.test(p1('', '150')), 'blank percent prompts -> ' + p1('', '150'));
  ok(/Enter/.test(p1('20', '')), 'blank base prompts -> ' + p1('20', ''));
  ok(/Enter/.test(p2('', '150')), 'blank part prompts -> ' + p2('', '150'));
  ok(/Enter/.test(p3('150', '')), 'blank new value prompts -> ' + p3('150', ''));
  // A stale answer must not survive invalid input
  p1('20', '150'); ok(!/^30$/.test(p1('abc', '150')), 'stale result cleared');
  // Nonzero tiny results must not display as 0
  const tiny = numOf(p2('1', '3000000'));
  ok(tiny > 0 && Math.abs(tiny - 1 / 30000) / (1 / 30000) < 1e-3, '1 of 3,000,000 = 0.00003333% -> ' + p2('1', '3000000'));
  // Overflow
  for (const s of [p1('1e308', '1e308'), p2('1e308', '1e-308'), p3('1e-308', '1e308')]) {
    ok(/too large/i.test(s), 'overflow reported -> ' + s); clean(s, 'overflow');
  }
  // Oracle sweep
  for (let k = 0; k < 400; k++) {
    const x = Math.round((rnd() * 2000 - 1000) * 100) / 100, y = Math.round((rnd() * 2000 - 1000) * 100) / 100 || 1;
    const r1 = numOf(p1(String(x), String(y))), r2 = numOf(p2(String(x), String(y)).replace('%', ''));
    ok(Math.abs(r1 - x * y / 100) <= 0.5e-4 + 1e-12 * Math.abs(x * y / 100), `sweep ${x}% of ${y}`);
    ok(Math.abs(r2 - x / y * 100) <= 0.5e-4 + 5e-4 * Math.abs(x / y * 100), `sweep ${x} of ${y}`);
  }
}

/* =========================== average-calculator =========================== */
function average() {
  const S = 'average-calculator', t = tool(S);
  const avg = s => { t.set('avg-input', s); return { mean: t.text('avg-big'), all: t.html('avg-out'), kv: l => t.kv('avg-out', l) }; };
  let r = avg('12, 7, 9, 12, 5, 20, 7, 14');       // the default data, computed by hand
  eq(r.mean, '10.75', 'default mean 86/8');
  eq(r.kv('Count'), '8'); eq(r.kv('Sum'), '86'); eq(r.kv('Median'), '10.5', 'median (9+12)/2');
  eq(r.kv('Mode'), '7, 12 (×2)', 'bimodal'); eq(r.kv('Minimum'), '5'); eq(r.kv('Maximum'), '20'); eq(r.kv('Range'), '15');
  r = avg('3 1 2'); eq(r.kv('Median'), '2', 'odd count median'); eq(r.kv('Mode'), 'No mode (all values unique)');
  r = avg('1 1 2 2'); eq(r.kv('Mode'), 'No mode (every value ties)');
  // A constant data set has a mode: the value itself
  r = avg('5, 5, 5'); eq(r.kv('Mode'), '5 (×3)', 'constant data mode -> ' + r.kv('Mode'));
  r = avg('-4\n-4\n10'); eq(r.mean, '0.6667', 'negatives'); eq(r.kv('Mode'), '-4 (×2)');
  r = avg('0.1 0.2 0.3'); eq(r.mean, '0.2', 'float sum'); eq(r.kv('Sum'), '0.6');
  r = avg('abc, 4, x, 6'); eq(r.kv('Count'), '2', 'non-numeric tokens ignored'); eq(r.mean, '5');
  r = avg('   '); ok(/Enter some numbers/.test(r.all), 'empty input prompts');
  // Tiny magnitudes must not display as 0
  r = avg('0.00001 0.00002'); ok(numOf(r.mean) === 0.000015, 'tiny mean keeps digits -> ' + r.mean);
  // Overflow: mean/median of huge values are finite even when the sum is not
  r = avg('1e308 1e308');
  clean(r.mean + r.all, 'huge values');
  eq(numOf(r.mean), 1e308, 'mean of 1e308,1e308');
  eq(numOf(r.kv('Median')), 1e308, 'median of 1e308,1e308');
  ok(/too large/i.test(r.kv('Sum')), 'sum overflow reported -> ' + r.kv('Sum'));
  r = avg('-1e308 1e308'); ok(/too large/i.test(r.kv('Range')), 'range overflow reported'); clean(r.all, 'range overflow');
  eq(r.mean, '0', 'symmetric huge values average to 0');
  // Oracle sweep
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(rnd() * 15), xs = Array.from({ length: n }, () => Math.round(rnd() * 200 - 100));
    r = avg(xs.join(', '));
    const s = xs.slice().sort((a, b) => a - b), mean = xs.reduce((a, b) => a + b, 0) / n;
    const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    ok(Math.abs(numOf(r.mean) - mean) <= 0.5e-4 + 1e-12, 'sweep mean ' + xs);
    ok(Math.abs(numOf(r.kv('Median')) - med) <= 1e-9, 'sweep median ' + xs);
    eq(numOf(r.kv('Range')), s[n - 1] - s[0], 'sweep range ' + xs);
  }
}

/* ======================== roman-numeral-converter ======================== */
function roman() {
  const S = 'roman-numeral-converter', t = tool(S);
  eq(t.big('rn-num-out'), 'MMXXVI', 'default 2026'); eq(t.big('rn-rom-out'), '2026', 'default MMXXVI');
  // Independent oracle: place-value tables
  const TH = ['', 'M', 'MM', 'MMM'], H = ['', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM'];
  const T = ['', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC'], O = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const ref = n => TH[Math.floor(n / 1000)] + H[Math.floor(n / 100) % 10] + T[Math.floor(n / 10) % 10] + O[n % 10];
  const canon = new Map();
  for (let n = 1; n <= 3999; n++) {
    const r = ref(n); canon.set(r, n);
    eq(t.set('rn-num', String(n)).big('rn-num-out'), r, 'to roman ' + n);
    eq(t.set('rn-rom', r).big('rn-rom-out'), String(n), 'from roman ' + r);
  }
  eq(t.set('rn-rom', ' mcmxcix ').big('rn-rom-out'), '1999', 'lowercase and spaces accepted');
  for (const bad of ['0', '4000', '-1', '1.5', '', '1e4'])
    ok(t.set('rn-num', bad).big('rn-num-out') === null, 'number refused: ' + JSON.stringify(bad));
  eq(t.set('rn-num', '1e3').big('rn-num-out'), 'M', 'exponent form of an integer is accepted');
  // Every string of up to 4 roman letters: accepted iff canonical
  const L = 'IVXLCDM'.split('');
  let strs = [''];
  for (let len = 1; len <= 4; len++) {
    strs = strs.flatMap(s => L.map(c => s + c));
    for (const s of strs) {
      const got = t.set('rn-rom', s).big('rn-rom-out');
      eq(got, canon.has(s) ? String(canon.get(s)) : null, 'roman string ' + s);
    }
  }
  for (const bad of ['IIII', 'VX', 'IC', 'XM', 'MMMM', 'ABC', 'X I', '']) ok(t.set('rn-rom', bad).big('rn-rom-out') === null, 'refused ' + bad);
}

/* ============================ loan-calculator ============================ */
function loan() {
  const S = 'loan-calculator', t = tool(S);
  const oracle = (P, apr, n) => { const r = apr / 1200; return r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n)); };
  // simulate the schedule: balance after n payments of the rounded payment must be ~0
  const residual = (P, apr, n, pay) => { let b = P; for (let k = 0; k < n; k++) b = b * (1 + apr / 1200) - pay; return b; };
  eq(t.big('ln-out'), '$420.04', 'default $20,000 at 9.5% for 5 years');
  ok(Math.abs(residual(20000, 9.5, 60, 420.04)) < 1, 'default payment amortizes to ~0');
  eq(t.kv('ln-out', 'Total of 60 payments'), money0(oracle(20000, 9.5, 60) * 60));
  const L = (amt, rate, term, unit) => t.setAll({ 'ln-amount': amt, 'ln-rate': rate, 'ln-term': term, 'ln-unit': unit || '12' }).html('ln-out');
  L('20000', '0', '5'); eq(t.big('ln-out'), '$333.33', '0% loan');
  eq(t.kv('ln-out', 'Total interest'), '$0');
  // Near-zero rates must converge to the 0% payment, not Infinity/NaN or garbage
  for (const tiny of ['1e-20', '1e-12', '0.0000001']) {
    const h = L('20000', tiny, '5'); clean(h, 'tiny rate ' + tiny);
    ok(Math.abs(numOf(t.big('ln-out')) - 20000 / 60) < 0.01, 'tiny rate ' + tiny + ' -> ' + t.big('ln-out'));
  }
  L('250000', '6.5', '360', '1'); eq(t.big('ln-out'), money2(oracle(250000, 6.5, 360)), '360-month term in months');
  L('1000', '12', '1', '1'); eq(t.big('ln-out'), '$1,010.00', 'one-month loan'); ok(/Total of 1 payment</.test(t.html('ln-out')), 'singular payment label');
  // Huge rate: payment tends to P*r, never NaN
  const h = L('1000', '100000', '30'); clean(h, 'huge rate'); ok(Math.abs(numOf(t.big('ln-out')) - 1000 * 100000 / 1200) < 0.01, 'huge-rate payment ~ P*r');
  // Invalid input
  for (const [a, r, n] of [['20000', '', '5'], ['', '5', '5'], ['20000', '5', '']]) {
    ok(/role="alert"/.test(L(a, r, n)), 'blank loan field rejected');
  }
  for (const [a, r, n] of [['20000', '-5', '5'], ['1e309', '5', '5'], ['20000', '5', '1e309'], ['-100', '5', '5']]) {
    const s = L(a, r, n); ok(/role="alert"|Enter a loan/.test(s), `refused ${a}/${r}/${n} -> ` + s); clean(s, 'invalid');
  }
  ok(/Enter a loan amount and term/.test(L('20000', '5', '0')), 'zero term prompts');
  // Sweep vs oracle
  for (let k = 0; k < 300; k++) {
    const P = Math.round(rnd() * 500000) + 100, apr = Math.round(rnd() * 3000) / 100, n = 1 + Math.floor(rnd() * 480);
    L(String(P), String(apr), String(n), '1');
    eq(t.big('ln-out'), money2(oracle(P, apr, n)), `sweep ${P}/${apr}/${n}`);
  }
}

/* ======================= compound-interest-calculator ======================= */
function compound() {
  const S = 'compound-interest-calculator', t = tool(S);
  // Oracle: month-by-month simulation, deposit at the end of each month
  const sim = (P, pmt, rate, N) => { let b = P; for (let k = 0; k < N; k++) b = b * (1 + rate / 1200) + pmt; return b; };
  eq(t.big('ci-out'), money0(sim(5000, 300, 7, 300)), 'default 25-year projection');
  const C = (P, m, r, y) => t.setAll({ 'ci-principal': P, 'ci-monthly': m, 'ci-rate': r, 'ci-years': y }).html('ci-out');
  C('5000', '300', '0', '25'); eq(t.big('ci-out'), '$95,000', '0% return'); eq(t.kv('ci-out', 'Interest earned'), '$0');
  // Near-zero rates must not drop the contributions (balance ~ deposits, interest ~ 0)
  for (const tiny of ['1e-20', '1e-12']) {
    C('5000', '300', tiny, '25');
    eq(t.big('ci-out'), '$95,000', 'tiny rate ' + tiny + ' balance');
    eq(t.kv('ci-out', 'Interest earned'), '$0', 'tiny rate ' + tiny + ' interest');
  }
  C('10000', '0', '6', '10'); eq(t.big('ci-out'), money0(10000 * Math.pow(1.005, 120)), 'lump sum only');
  C('0', '100', '12', '1'); eq(t.big('ci-out'), money0(sim(0, 100, 12, 12)), 'annuity only');
  C('1000', '0', '12', '0.5'); eq(t.big('ci-out'), money0(1000 * Math.pow(1.01, 6)), 'half a year = 6 months');
  // Invalid ranges
  for (const [P, m, r, y] of [['5000', '300', '7', '-5'], ['5000', '300', '7', '0'], ['5000', '300', '7', '81'], ['-5000', '300', '7', '10'],
    ['5000', '-300', '7', '10'], ['5000', '300', '-7', '10'], ['1e309', '0', '7', '10'], ['5000', '300', '7', '']]) {
    const s = C(P, m, r, y); ok(/role="alert"|Enter/.test(s), `refused ${[P, m, r, y]} -> ` + s); clean(s, 'invalid');
    ok(!/after -/.test(s), 'no negative-years headline');
  }
  const s = C('1e12', '1e12', '1000', '80'); ok(/too large/i.test(s) || !JUNK.test(s), 'overflow handled'); clean(s, 'overflow');
  // Sweep vs simulation
  for (let k = 0; k < 200; k++) {
    const P = Math.round(rnd() * 100000), m = Math.round(rnd() * 2000), r = Math.round(rnd() * 1500) / 100, y = 1 + Math.floor(rnd() * 50);
    C(String(P), String(m), String(r), String(y));
    const want = sim(P, m, r, y * 12), got = numOf(t.big('ci-out'));
    ok(Math.abs(got - want) <= 0.5 + 1e-9 * want, `sweep ${[P, m, r, y]}: ${got} vs ${want}`);
  }
}

/* ============================= tip-calculator ============================= */
function tip() {
  const S = 'tip-calculator', t = tool(S);
  const { src } = source(S);
  const active = /class="chip active" data-tip="(\d+)"/.exec(src), def = /id="tip-pct" value="(\d+)"/.exec(src);
  eq(active && active[1], def && def[1], 'highlighted preset matches the default tip %');
  eq(t.kv('tip-out', 'Tip'), '$10.00', 'default $50 at 20%'); eq(t.kv('tip-out', 'Total'), '$60.00');
  const T = (bill, pct, people, round) => { t.setAll({ 'tip-bill': bill, 'tip-pct': pct, 'tip-people': people }); t.set('tip-round', !!round); return t.html('tip-out'); };
  T('87.40', '18', '1'); eq(t.kv('tip-out', 'Tip'), '$15.73'); eq(t.kv('tip-out', 'Total'), '$103.13');
  T('100', '0', '3'); eq(t.kv('tip-out', 'Each person (3)'), '$33.33', 'split');
  T('10.01', '0', '1', true); eq(t.kv('tip-out', 'Total'), '$11.00', 'round up 10.01'); eq(t.kv('tip-out', 'Tip'), '$0.99');
  T('10', '10', '1', true); eq(t.kv('tip-out', 'Total'), '$11.00', 'exact dollar total stays');
  // Float noise: 132.80 + 87.5% = exactly $249.00, must not round up to $250
  T('132.80', '87.5', '1', true); eq(t.kv('tip-out', 'Total'), '$249.00', 'no float-noise round-up');
  // Exhaustive: bills in cents, integer tips; round-up equals exact ceiling in cents
  for (let c = 1; c <= 3000; c += 7) for (const p of [0, 10, 15, 18, 20, 22, 25]) {
    T((c / 100).toFixed(2), String(p), '1', true);
    const tipC = Math.round(c * p / 100), totC = Math.ceil((c + tipC) / 100) * 100;
    eq(t.kv('tip-out', 'Total'), money2(totC / 100), `round-up ${c / 100} @ ${p}%`);
  }
  for (const [b, p] of [['-50', '20'], ['50', '-20']]) { const s = T(b, p, '1'); ok(/role="alert"/.test(s), `refused ${b}/${p} -> ` + s); }
  for (const [b, p] of [['', '20'], ['50', ''], ['', '']]) {
    ok(/role="alert"/.test(T(b, p, '1')), 'blank tip field rejected');
  }
  T('0', '0', '1'); eq(t.kv('tip-out', 'Total'), '$0.00', 'explicit zero remains valid');
}

/* ========================== final-grade-calculator ========================== */
function finalGrade() {
  const S = 'final-grade-calculator', t = tool(S);
  eq(t.big('fg-out'), '94.7%', 'default 88/30/90');
  const F = (c, w, d) => { t.setAll({ 'fg-current': c, 'fg-weight': w, 'fg-desired': d }); return { big: t.big('fg-out'), text: t.text('fg-out') }; };
  // The displayed score is a minimum: it must actually reach the target
  let r = F('85.38', '50', '90');                 // exact need 94.62
  eq(r.big, '94.7%', 'required score is rounded up, not down');
  ok(85.38 * 0.5 + 94.7 * 0.5 >= 90, 'shown score reaches the target');
  // Message must agree with the number shown
  r = F('79.96', '50', '90');                     // exact need 100.04
  ok(numOf(r.big) > 100 && /extra credit/.test(r.text), 'over-100 need is shown above 100 -> ' + r.big);
  r = F('80', '50', '90'); eq(r.big, '100%', 'exactly 100 needed'); ok(/within reach/.test(r.text));
  r = F('95', '10', '85'); ok(/already secured/.test(r.text), 'secured case: 95 x 0.9 = 85.5 >= 85');
  r = F('70', '100', '90'); eq(r.big, '90%', 'final worth 100%');
  ok(/greater than 0/.test(F('88', '0', '90').text), 'zero weight refused');
  for (const [c, w, d] of [['88', '150', '90'], ['88', '-10', '90'], ['-5', '30', '90'], ['88', '30', '-1'], ['1e309', '30', '90']]) {
    r = F(c, w, d); ok(/role="alert"|must be|Enter/.test(t.html('fg-out')) && r.big === null, `refused ${c}/${w}/${d} -> ` + r.text);
  }
  // Sweep: shown value is the smallest 0.1 step that reaches the target, and the message matches it
  for (let k = 0; k < 2000; k++) {
    const c = Math.round(rnd() * 1000) / 10, w = 1 + Math.round(rnd() * 990) / 10, d = Math.round(rnd() * 1000) / 10;
    r = F(String(c), String(w), String(d));
    const need = (d - c * (1 - w / 100)) / (w / 100), shown = numOf(r.big);
    ok(shown + 1e-9 >= need && shown - need < 0.1 + 1e-9, `sweep ${c}/${w}/${d}: shown ${shown}, need ${need}`);
    if (shown > 100) ok(/extra credit/.test(r.text), 'msg >100 ' + [c, w, d]);
    else if (need <= 0) ok(/already secured/.test(r.text), 'msg secured ' + [c, w, d]);
    else ok(/within reach/.test(r.text), 'msg reachable ' + [c, w, d]);
  }
}

/* ================================== main ================================== */
const SUITES = {
  'unit-converter': unitConverter, 'percentage-calculator': percentage, 'average-calculator': average,
  'roman-numeral-converter': roman, 'loan-calculator': loan, 'compound-interest-calculator': compound,
  'tip-calculator': tip, 'final-grade-calculator': finalGrade
};
const args = process.argv.slice(2).filter(a => a !== '--soft' && !a.startsWith('--root='));
const want = args.length ? args : Object.keys(SUITES);
let failed = 0;
for (const name of want) {
  const before = checks, fb = softFails.length;
  try {
    SUITES[name]();
    const n = softFails.length - fb;
    if (n) {
      failed++;
      const uniq = [...new Set(softFails.slice(fb).map(s => s.replace(/\d[\d.e+-]*/g, '#')))];
      console.log('FAIL ' + name + ': ' + n + ' of ' + (checks - before) + ' checks failed; first of each kind:');
      for (const u of uniq.slice(0, 12)) console.log('   - ' + softFails.slice(fb).find(s => s.replace(/\d[\d.e+-]*/g, '#') === u).slice(0, 220));
    } else console.log('PASS ' + name + ' (' + (checks - before) + ' checks)');
  } catch (e) { failed++; console.log('FAIL ' + name + ' after ' + (checks - before) + ' checks: ' + String(e.message).split('\n')[0].slice(0, 400)); }
}
console.log((failed ? 'FAILED ' + failed + ' of ' : 'PASS all ') + want.length + ' suites; ' + checks + ' checks');
process.exitCode = failed ? 1 : 0;
