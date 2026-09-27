// Formula/input review of six previously untested calculators: square footage,
// sales tax, salary to hourly, fuel cost, discount and simple interest.
// Runs each tool's real inline script against a small DOM model and checks results
// against independent oracles (integer-cent arithmetic, exact unit definitions).
//   node test-everyday-review.cjs                 (all suites)
//   node test-everyday-review.cjs sales-tax-calculator discount-calculator
// --root=DIR (or TN_ROOT) points the suite at another copy of tools/ (e.g. the baseline);
// --soft (or SOFT=1) reports every failing check instead of stopping at the first.
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
class El {
  constructor(tag, attrs) {
    this.tag = tag; this.attrs = attrs; this.id = attrs.id; this.listeners = {}; this.style = {};
    this.className = attrs.class || ''; this._html = ''; this._text = ''; this.checked = 'checked' in attrs;
    this.value = attrs.value || '';
  }
  get innerHTML() { return this._html; }
  set innerHTML(s) { this._html = String(s); this._text = ''; }
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
  for (const m of src.matchAll(/<(input|div|span|p|button)\b([^>]*)>/g)) {
    const a = attrsOf(m[2]);
    if (!a.id) continue;
    assert.ok(!nodes[a.id], slug + ': duplicate id ' + a.id);
    nodes[a.id] = new El(m[1], a);
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
      if (n.attrs.type === 'checkbox') n.checked = !!val; else n.value = String(val);
      n.fire('input'); n.fire('change');
      return this;
    },
    setAll(obj) { for (const [k, v] of Object.entries(obj)) this.set(k, v); return this; },
    html(id) { return nodes[id].innerHTML || nodes[id].textContent; },
    text(id) { return decode(this.html(id).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); },
    big(id) { const m = /class="result-big">([^<]*)</.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null; },
    // value of the kv row whose label starts with `label`
    kv(id, label) {
      const re = new RegExp('<span>(?:<strong>)?' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*(?:</strong>)?</span><span class="v">(?:<strong>)?([^<]*)');
      const m = re.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null;
    },
    kvLabel(id, label) {
      const re = new RegExp('<span>(?:<strong>)?(' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*)');
      const m = re.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null;
    }
  };
}

/* ------------------------------ helpers ------------------------------ */
let checks = 0;
const SOFT = !!process.env.SOFT || process.argv.includes('--soft'), softFails = [];
function guard(fn, msg) { checks++; try { fn(); } catch (e) { if (!SOFT) throw e; softFails.push(String(msg || e.message).split('\n')[0]); } }
const ok = (c, msg) => guard(() => assert.ok(c, msg), msg);
const eq = (a, b, msg) => guard(() => assert.strictEqual(a, b, msg), (msg || '') + ' [got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ']');
const JUNK = /NaN|Infinity|undefined|∞|null/;
function clean(s, where) { ok(!JUNK.test(s), where + ': junk in output -> ' + s); }
function numOf(s) { const m = /-?[\d,]*\.?\d+(?:E[-+]?\d+)?/i.exec(String(s).replace(/\$/g, '')); return m ? Number(m[0].replace(/,/g, '')) : NaN; }
const centsOf = s => Math.round(numOf(s) * 100);
const alerted = (t, id) => /role="alert"/.test(t.html(id));
const money2 = x => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x);
const fromCents = c => money2(c / 100);                       // exact: c is an integer
const halfUp = (num, den) => Math.floor((2 * num + den) / (2 * den));   // integer num/den, round half up
let seed = 20260927;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// The same invalid-input battery for every tool: each must alert and render no junk.
function refuses(t, outId, base, cases, where) {
  for (const [id, v] of cases) {
    t.setAll(base).set(id, v);
    ok(alerted(t, outId), `${where}: ${id}=${JSON.stringify(v)} refused -> ` + t.text(outId).slice(0, 120));
    clean(t.html(outId), `${where}: ${id}=${JSON.stringify(v)}`);
  }
  t.setAll(base);
  ok(!alerted(t, outId), where + ': valid input recovers after an error');
}

/* ======================= square-footage-calculator ======================= */
function squareFootage() {
  const S = 'square-footage-calculator', t = tool(S);
  const SQM = 0.3048 * 0.3048;                                   // international foot, exact
  const base = { 'sqft-length': '12', 'sqft-width': '10', 'sqft-price': '0' };
  eq(t.text('sqft-big'), '120 sq ft', 'default 12 x 10');
  eq(t.kv('sqft-out', 'Square yards'), '13.33 yd²', '120 / 9');
  eq(t.kv('sqft-out', 'Square meters'), '11.15 m²', '120 x 0.09290304 = 11.148');
  eq(t.kv('sqft-out', 'Total cost'), null, 'no cost line at $0/sq ft');
  const A = (l, w, p) => { t.setAll({ 'sqft-length': l, 'sqft-width': w, 'sqft-price': p }); return t.html('sqft-out'); };
  A('12', '10', '4.5'); eq(t.kv('sqft-out', 'Total cost'), '$540.00', '120 sq ft at $4.50');
  A('12', '10', ''); eq(t.kv('sqft-out', 'Total cost'), null, 'blank optional price means no cost');
  ok(!alerted(t, 'sqft-out'), 'blank optional price is not an error');
  // 1,000,000 sq ft is exactly 92,903.04 m²; a truncated 0.092903 factor shows 92,903
  A('1000', '1000', '0'); eq(t.kv('sqft-out', 'Square meters'), '92,903.04 m²', 'exact square-foot-to-m² factor');
  eq(t.kv('sqft-out', 'Square yards'), '111,111.11 yd²');
  A('12.5', '10.25', '0'); eq(t.text('sqft-big'), '128.13 sq ft', '12.5 x 10.25 = 128.125');
  // Nonzero tiny areas must not display as 0
  A('0.01', '0.01', '0'); ok(numOf(t.text('sqft-big')) === 0.0001, '0.01 x 0.01 = 0.0001 sq ft -> ' + t.text('sqft-big'));
  ok(numOf(t.kv('sqft-out', 'Square meters')) > 0, 'tiny area in m² is not 0');
  A('0', '10', '0'); eq(t.text('sqft-big'), '0 sq ft', 'explicit zero stays valid');
  refuses(t, 'sqft-out', base, [['sqft-length', ''], ['sqft-width', ''], ['sqft-length', '-12'], ['sqft-width', '-1'],
    ['sqft-length', '1e309'], ['sqft-width', '-1e309'], ['sqft-length', '1e200'], ['sqft-price', '-4'], ['sqft-price', '1e309']], S);
  A('', '10', '0'); ok(!/sq ft/.test(t.text('sqft-big')), 'no stale area headline after invalid input -> ' + t.text('sqft-big'));
  for (let k = 0; k < 300; k++) {
    const l = Math.round(rnd() * 50000) / 100, w = Math.round(rnd() * 50000) / 100, p = Math.round(rnd() * 5000) / 100;
    A(String(l), String(w), String(p));
    const area = l * w;
    ok(Math.abs(numOf(t.text('sqft-big')) - area) <= 0.005 + 1e-9 * area, `sweep area ${l}x${w}`);
    ok(Math.abs(numOf(t.kv('sqft-out', 'Square yards')) - area / 9) <= 0.005 + 1e-9 * area, `sweep yd² ${l}x${w}`);
    ok(Math.abs(numOf(t.kv('sqft-out', 'Square meters')) - area * SQM) <= 0.005 + 1e-9 * area, `sweep m² ${l}x${w}`);
    if (p > 0) ok(Math.abs(numOf(t.kv('sqft-out', 'Total cost')) - area * p) <= 0.005 + 1e-9 * area * p, `sweep cost ${l}x${w}@${p}`);
  }
}

/* ========================== sales-tax-calculator ========================== */
function salesTax() {
  const S = 'sales-tax-calculator', t = tool(S);
  const base = { 'st-amount': '50', 'st-rate': '8', 'st-reverse': false };
  const parts = () => ({ pre: t.kv('st-out', 'Price before tax'), tax: t.kv('st-out', 'Sales tax'), tot: t.kv('st-out', 'Total with tax') });
  let p = parts();
  eq(t.big('st-out'), '$54.00', 'default $50 + 8%'); eq(p.tax, '$4.00'); eq(p.pre, '$50.00');
  const T = (a, r, rev) => { t.setAll({ 'st-amount': a, 'st-rate': r }).set('st-reverse', !!rev); return parts(); };
  p = T('54', '8', true); eq(t.big('st-out'), '$50.00', 'reverse $54 at 8%'); eq(p.tax, '$4.00');
  p = T('19.99', '8.25', false); eq(p.tax, '$1.65', '19.99 x 8.25% = 1.649'); eq(p.tot, '$21.64');
  eq(t.kvLabel('st-out', 'Sales tax'), 'Sales tax (8.25%)', 'rate shown in the label');
  p = T('100', '0', false); eq(p.tot, '$100.00', '0% rate'); p = T('100', '0', true); eq(p.pre, '$100.00', 'reverse 0% rate');
  p = T('0', '8', false); eq(p.tot, '$0.00', 'explicit zero amount is valid');
  // Half-cent tax rounds up, and the three lines always add up
  p = T('0.05', '10', false); eq(p.tax, '$0.01', 'half-cent tax rounds up'); eq(p.tot, '$0.06', '$0.05 + $0.01');
  // 165 x 2.9% is exactly 4.785; binary noise (4.78499...) used to show $4.78 beside a $169.79 total
  p = T('165', '2.9', false); eq(p.tax, '$4.79', '$165 at 2.9% tax'); eq(p.tot, '$169.79', '$165 + $4.79');
  p = T('515', '2.9', false); eq(p.tax, '$14.94', '$515 at 2.9% = 14.935'); eq(p.tot, '$529.94');
  // 41000 x 6.35 / 100 = 2603.4999999999995 in binary; the exact 26.035 must still round up
  p = T('410', '6.35', false); eq(p.tax, '$26.04', '$410 at 6.35% = 26.035'); eq(p.tot, '$436.04');
  refuses(t, 'st-out', base, [['st-amount', ''], ['st-rate', ''], ['st-amount', '-50'], ['st-rate', '-8'], ['st-rate', '101'],
    ['st-amount', '1e309'], ['st-rate', '1e309'], ['st-amount', '1e13']], S);
  t.set('st-reverse', true);
  refuses(t, 'st-out', { 'st-amount': '54', 'st-rate': '8' }, [['st-rate', '-100'], ['st-rate', '-150'], ['st-amount', '']], S + ' reverse');
  t.set('st-reverse', false);
  // Exhaustive-ish: amounts in cents x rates with up to three decimals, against integer oracles
  for (const rate of ['0', '1', '2.9', '4.712', '6', '6.35', '7.25', '8.875', '10.25', '15']) {
    const R = Math.round(Number(rate) * 1000), D = 100000 + R;          // rate in thousandths of a percent
    for (let c = 1; c <= 4000; c += 3) {
      const amt = (c / 100).toFixed(2);
      p = T(amt, rate, false);
      const taxC = halfUp(c * R, 100000);
      eq(p.tax, fromCents(taxC), `forward ${amt} @ ${rate}% tax`);
      eq(centsOf(p.pre) + centsOf(p.tax), centsOf(p.tot), `forward ${amt} @ ${rate}% lines add up`);
      p = T(amt, rate, true);
      const preC = halfUp(c * 100000, D);
      eq(p.pre, fromCents(preC), `reverse ${amt} @ ${rate}% pre-tax`);
      eq(centsOf(p.pre) + centsOf(p.tax), centsOf(p.tot), `reverse ${amt} @ ${rate}% lines add up`);
      eq(p.tot, fromCents(c), `reverse ${amt} total is the entered amount`);
    }
    for (let k = 0; k < 400; k++) {                                     // larger amounts, up to $200,000
      const c = 1 + Math.floor(rnd() * 20000000), amt = (c / 100).toFixed(2);
      p = T(amt, rate, false);
      eq(p.tax, fromCents(halfUp(c * R, 100000)), `forward ${amt} @ ${rate}% tax`);
      eq(centsOf(p.pre) + centsOf(p.tax), centsOf(p.tot), `forward ${amt} @ ${rate}% lines add up`);
      p = T(amt, rate, true);
      eq(p.pre, fromCents(halfUp(c * 100000, D)), `reverse ${amt} @ ${rate}% pre-tax`);
      eq(centsOf(p.pre) + centsOf(p.tax), centsOf(p.tot), `reverse ${amt} @ ${rate}% lines add up`);
    }
  }
}

/* ======================= salary-to-hourly-calculator ======================= */
function salaryHourly() {
  const S = 'salary-to-hourly-calculator', t = tool(S);
  eq(t.big('sh-a-out'), '$28.85/hr', 'default $60,000 / 2,080 h');
  eq(t.kv('sh-a-out', 'Daily'), '$230.77', '8 h day'); eq(t.kv('sh-a-out', 'Weekly'), '$1,153.85');
  eq(t.kv('sh-a-out', 'Biweekly'), '$2,307.69'); eq(t.kv('sh-a-out', 'Monthly'), '$5,000.00');
  ok(/5-day/.test(t.kvLabel('sh-a-out', 'Daily') || ''), 'daily figure states its 5-day-week assumption -> ' + t.kvLabel('sh-a-out', 'Daily'));
  eq(t.big('sh-b-out'), '$52,000.00/yr', 'default $25 x 40 x 52');
  eq(t.kv('sh-b-out', 'Monthly'), '$4,333.33'); eq(t.kv('sh-b-out', 'Weekly'), '$1,000.00');
  const A = (s, h, w) => { t.setAll({ 'sh-salary': s, 'sh-a-hours': h, 'sh-a-weeks': w }); return t.html('sh-a-out'); };
  const B = (r, h, w) => { t.setAll({ 'sh-rate': r, 'sh-b-hours': h, 'sh-b-weeks': w }); return t.html('sh-b-out'); };
  A('30000', '20', '50'); eq(t.big('sh-a-out'), '$30.00/hr', 'part-time 1,000 h'); eq(t.kv('sh-a-out', 'Daily'), '$120.00', '4 h day');
  eq(t.kv('sh-a-out', 'Weekly'), '$600.00', 'per week worked');
  B('17.5', '37.5', '48'); eq(t.big('sh-b-out'), '$31,500.00/yr', '17.5 x 37.5 x 48');
  const baseA = { 'sh-salary': '60000', 'sh-a-hours': '40', 'sh-a-weeks': '52' };
  const baseB = { 'sh-rate': '25', 'sh-b-hours': '40', 'sh-b-weeks': '52' };
  refuses(t, 'sh-a-out', baseA, [['sh-salary', ''], ['sh-salary', '-60000'], ['sh-salary', '1e309'], ['sh-salary', '1e13'],
    ['sh-a-hours', ''], ['sh-a-hours', '0'], ['sh-a-hours', '169'], ['sh-a-hours', '1e309'],
    ['sh-a-weeks', ''], ['sh-a-weeks', '0'], ['sh-a-weeks', '54'], ['sh-a-weeks', '-52']], S + ' A');
  refuses(t, 'sh-b-out', baseB, [['sh-rate', ''], ['sh-rate', '-25'], ['sh-rate', '1e309'], ['sh-b-hours', '200'],
    ['sh-b-hours', ''], ['sh-b-weeks', '100'], ['sh-b-weeks', '1e309']], S + ' B');
  A('60000', '168', '53'); ok(!alerted(t, 'sh-a-out'), 'upper bounds 168 h / 53 weeks accepted');
  for (let k = 0; k < 300; k++) {
    const s = Math.round(rnd() * 400000) + 1000, h = 1 + Math.round(rnd() * 670) / 10, w = 1 + Math.floor(rnd() * 52);
    A(String(s), String(h), String(w));
    eq(t.big('sh-a-out'), money2(s / (h * w)) + '/hr', `sweep A ${s}/${h}/${w}`);
    eq(t.kv('sh-a-out', 'Weekly'), money2(s / w), `sweep A weekly ${s}/${w}`);
    const r = Math.round(rnd() * 20000) / 100;
    B(String(r), String(h), String(w));
    eq(t.big('sh-b-out'), money2(r * h * w) + '/yr', `sweep B ${r}/${h}/${w}`);
  }
  // Both sections have fields called "Hours per week" / "Weeks per year": each set must sit in a
  // group named by its section heading so screen-reader users can tell them apart.
  const { src } = source(S);
  for (const [grp, ids] of [['a', ['sh-salary', 'sh-a-hours', 'sh-a-weeks']], ['b', ['sh-rate', 'sh-b-hours', 'sh-b-weeks']]]) {
    const m = new RegExp('<div role="group" aria-labelledby="([^"]+)">([\\s\\S]*?)</div>\\s*<div class="result" id="sh-' + grp + '-out"').exec(src);
    ok(m, 'section ' + grp + ' inputs are wrapped in a labelled group');
    if (!m) continue;
    ok(new RegExp('<h2[^>]*id="' + m[1] + '"').test(src), 'group ' + grp + ' is named by an h2');
    for (const id of ids) ok(m[2].includes('id="' + id + '"'), id + ' is inside group ' + grp);
  }
}

/* ========================== fuel-cost-calculator ========================== */
function fuelCost() {
  const S = 'fuel-cost-calculator', t = tool(S);
  const base = { 'fuel-dist': '280', 'fuel-mpg': '28', 'fuel-price': '3.50', 'fuel-people': '1', 'fuel-round': false };
  eq(t.text('fuel-big'), '$35.00', 'default 280 mi / 28 mpg x $3.50');
  eq(t.kv('fuel-out', 'Gallons used'), '10 gal');
  const F = o => { t.setAll(Object.assign({}, base, o)); return t.html('fuel-out'); };
  F({ 'fuel-round': true }); eq(t.text('fuel-big'), '$70.00', 'round trip doubles'); eq(t.kv('fuel-out', 'Distance'), '560 mi (round trip)');
  eq(t.kv('fuel-out', 'Gallons used'), '20 gal');
  F({ 'fuel-round': true, 'fuel-people': '4' }); eq(t.kv('fuel-out', 'Cost per person'), '$17.50', '$70 / 4');
  F({ 'fuel-dist': '350', 'fuel-mpg': '31.5', 'fuel-price': '3.899' }); eq(t.kv('fuel-out', 'Gallons used'), '11.11 gal', '350 / 31.5');
  eq(t.text('fuel-big'), money2(350 / 31.5 * 3.899), '11.111 gal x $3.899 = $43.32');
  F({ 'fuel-people': '' }); ok(!alerted(t, 'fuel-out'), 'blank people defaults to 1'); eq(t.text('fuel-big'), '$35.00');
  F({ 'fuel-dist': '0' }); eq(t.text('fuel-big'), '$0.00', 'explicit zero distance is valid');
  refuses(t, 'fuel-out', base, [['fuel-mpg', ''], ['fuel-mpg', '0'], ['fuel-mpg', '-28'], ['fuel-dist', ''], ['fuel-price', ''],
    ['fuel-dist', '-280'], ['fuel-price', '-3.5'], ['fuel-dist', '1e309'], ['fuel-mpg', '1e-300'], ['fuel-price', '1e309'],
    ['fuel-people', '1e309'], ['fuel-people', '0'], ['fuel-people', '-2']], S);
  F({ 'fuel-mpg': '' }); ok(!/\$/.test(t.text('fuel-big')), 'no stale $ headline when MPG is blank -> ' + t.text('fuel-big'));
  for (let k = 0; k < 300; k++) {
    const d = Math.round(rnd() * 300000) / 100, m = 5 + Math.round(rnd() * 600) / 10, pr = Math.round(rnd() * 800) / 100;
    const n = 1 + Math.floor(rnd() * 6), round = rnd() < 0.5, dist = round ? 2 * d : d;
    F({ 'fuel-dist': String(d), 'fuel-mpg': String(m), 'fuel-price': String(pr), 'fuel-people': String(n), 'fuel-round': round });
    eq(t.text('fuel-big'), money2(dist / m * pr), `sweep cost ${d}/${m}/${pr}/${round}`);
    if (n > 1) eq(t.kv('fuel-out', 'Cost per person'), money2(dist / m * pr / n), `sweep split ${n}`);
  }
}

/* ========================== discount-calculator ========================== */
function discount() {
  const S = 'discount-calculator', t = tool(S);
  const base = { 'dc-price': '80', 'dc-pct': '25', 'dc-pct2': '0', 'dc-tax': '0' };
  eq(t.big('dc-out'), '$60.00', 'default $80 at 25% off'); eq(t.kv('dc-out', 'You save'), '$20.00 (25%)');
  const D = (p, a, b, x) => { t.setAll({ 'dc-price': p, 'dc-pct': a, 'dc-pct2': b, 'dc-tax': x }); return t.html('dc-out'); };
  const note = () => /<p class="note">([^<]*)<\/p>/.exec(t.html('dc-out'));
  D('100', '20', '10', '0'); eq(t.big('dc-out'), '$72.00', '20% then 10%'); eq(t.kv('dc-out', 'You save'), '$28.00 (28%)');
  ok(/gives 28% off — not 30%/.test(t.text('dc-out')), 'stacked note 28 vs 30');
  // The stacked-discount note must never contradict itself through rounding
  for (const [a, b, eff, sum] of [['33', '1', '33.67', '34'], ['1', '1', '1.99', '2'], ['10', '0.5', '10.45', '10.5']]) {
    D('100', a, b, '0'); const n = note();
    ok(n && n[1].includes('gives ' + eff + '% off') && n[1].includes('not ' + sum + '%'), `${a}% + ${b}% note -> ` + (n && n[1]));
  }
  D('100', '0', '10', '0'); ok(!note() || !/not 10%/.test(note()[1]), 'no "10% — not 10%" note when only one discount applies');
  D('19.99', '15', '0', '8.25');                 // register order: discount to the cent, then tax on that
  eq(t.kv('dc-out', 'After 15% off'), '$16.99'); eq(t.kv('dc-out', 'Sales tax'), '$1.40'); eq(t.big('dc-out'), '$18.39');
  // $0.10 at 15% off is $0.085: sale $0.09 and savings $0.01 must add back to $0.10 (was $0.09 + $0.02)
  D('0.10', '15', '0', '0'); eq(t.big('dc-out'), '$0.09', '$0.10 at 15% off'); eq(t.kv('dc-out', 'You save'), '$0.01 (15%)');
  // $410 x 6.35% = 26.035 exactly, computed in binary as 2603.4999999999995 cents: must round up
  D('410', '0', '0', '6.35'); eq(t.kv('dc-out', 'Sales tax'), '$26.04', 'half-cent tax after binary noise'); eq(t.big('dc-out'), '$436.04');
  D('80', '100', '0', '0'); eq(t.big('dc-out'), '$0.00', '100% off is free'); eq(t.kv('dc-out', 'You save'), '$80.00 (100%)');
  D('80', '25', '', ''); ok(!alerted(t, 'dc-out'), 'blank optional fields are not errors'); eq(t.big('dc-out'), '$60.00');
  refuses(t, 'dc-out', base, [['dc-price', ''], ['dc-pct', ''], ['dc-pct', '150'], ['dc-pct', '-25'], ['dc-pct2', '101'], ['dc-pct2', '-5'],
    ['dc-tax', '-1'], ['dc-tax', '101'], ['dc-price', '-80'], ['dc-price', '1e309'], ['dc-pct', '1e309']], S);
  D('80', '150', '0', '0'); ok(!/-\$/.test(t.text('dc-out')), 'never a negative price');
  // Sweep against an integer-cent oracle; lines must add up to the headline
  for (let k = 0; k < 1500; k++) {
    // discounts in hundredths of a percent (half of them whole percents), tax in thousandths
    const pc = 1 + Math.floor(rnd() * 5000000), A = rnd() < 0.5 ? 100 * Math.floor(rnd() * 101) : Math.floor(rnd() * 10001);
    const B = rnd() < 0.5 ? 0 : Math.floor(rnd() * 6000), xt = rnd() < 0.5 ? 0 : Math.round(rnd() * 12000);
    D((pc / 100).toFixed(2), String(A / 100), String(B / 100), String(xt / 1000));
    const a1 = halfUp(pc * (10000 - A), 10000), a2 = halfUp(a1 * (10000 - B), 10000), tx = halfUp(a2 * xt, 100000);
    eq(t.big('dc-out'), fromCents(a2 + tx), `sweep ${pc / 100} ${A / 100}%+${B / 100}% tax ${xt / 1000}%`);
    eq(numOf(t.kv('dc-out', 'You save')), (pc - a2) / 100, `sweep saved ${pc / 100} ${A / 100}%+${B / 100}%`);
  }
}

/* ======================= simple-interest-calculator ======================= */
function simpleInterest() {
  const S = 'simple-interest-calculator', t = tool(S);
  const base = { 'si-principal': '10000', 'si-rate': '5', 'si-years': '3' };
  eq(t.big('si-out'), '$1,500.00', 'default 10,000 x 5% x 3');
  eq(t.kv('si-out', 'Total amount'), '$11,500.00'); eq(t.kv('si-out', 'Principal'), '$10,000.00');
  const I = (P, r, y) => { t.setAll({ 'si-principal': P, 'si-rate': r, 'si-years': y }); return t.html('si-out'); };
  I('2500', '4.25', '0.5'); eq(t.big('si-out'), '$53.13', '2,500 x 4.25% x 0.5 = 53.125');
  I('999.50', '6', '1'); eq(t.kv('si-out', 'Principal'), '$999.50', 'principal shown to the cent, not rounded to $1,000');
  eq(t.kv('si-out', 'Total amount'), '$1,059.47', '999.50 + 59.97'); eq(t.kv('si-out', 'Rate &amp; time'), '6% for 1 yr');
  I('5000', '0', '2'); eq(t.big('si-out'), '$0.00', 'explicit 0% is valid'); ok(!alerted(t, 'si-out'));
  I('10000', '5', '0'); ok(/Enter a principal and time/.test(t.text('si-out')), 'zero years prompts');
  refuses(t, 'si-out', base, [['si-rate', ''], ['si-principal', ''], ['si-years', ''], ['si-rate', '-5'], ['si-principal', '-10000'],
    ['si-years', '-3'], ['si-principal', '1e309'], ['si-rate', '1e309'], ['si-years', '1e309'], ['si-principal', '1e13']], S);
  for (let k = 0; k < 400; k++) {
    const P = Math.round(rnd() * 5000000) / 100, r = Math.round(rnd() * 2500) / 100, y = Math.round(rnd() * 400) / 4 + 0.25;
    I(String(P), String(r), String(y));
    const want = P * r * y / 100;
    ok(Math.abs(numOf(t.big('si-out')) - want) <= 0.005 + 1e-12 * want, `sweep ${P}/${r}/${y}: ${t.big('si-out')} vs ${want}`);
    ok(Math.abs(numOf(t.kv('si-out', 'Total amount')) - (P + want)) <= 0.005 + 1e-12 * want, `sweep total ${P}/${r}/${y}`);
  }
}

/* ===================== markup, accessibility and layout ===================== */
function markup() {
  const slugs = ['square-footage-calculator', 'sales-tax-calculator', 'salary-to-hourly-calculator',
    'fuel-cost-calculator', 'discount-calculator', 'simple-interest-calculator'];
  for (const s of slugs) {
    const { src, code } = source(s);
    // every control has an explicit <label for>, or sits inside a <label>
    for (const m of src.matchAll(/<input\b([^>]*)>/g)) {
      const id = attrsOf(m[1]).id, before = src.slice(0, m.index);
      const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
      ok(wrapped || src.includes('<label for="' + id + '">'), s + ': #' + id + ' has a label');
    }
    // live results are announced politely (errors separately use role="alert")
    const results = [...src.matchAll(/<div class="result"[^>]*>/g)].map(m => m[0]);
    ok(results.length > 0, s + ': has a result box');
    for (const r of results) ok(/aria-live="polite"/.test(r), s + ': result is a polite live region -> ' + r);
    // generated page is in sync with the source (build.py was run)
    const docs = path.join(ROOT, 'docs', s, 'index.html');
    if (fs.existsSync(docs)) { const d = fs.readFileSync(docs, 'utf8'); for (const c of code) ok(d.includes(c), s + ': docs/ page is rebuilt from current source'); }
  }
  // Narrow screens: long currency strings in the headline and in kv values must be able to wrap
  // instead of pushing the result box wider than a 320 px viewport.
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
  const rule = sel => { const m = new RegExp('(?:^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'm').exec(css); return m ? m[1] : ''; };
  ok(/overflow-wrap:anywhere/.test(rule('.result-big')), '.result-big can wrap long numbers');
  ok(/overflow-wrap:anywhere/.test(rule('.kv .v')), '.kv .v can wrap long numbers');
  ok(/text-align:right/.test(rule('.kv .v')), '.kv .v stays right-aligned when it wraps');
}

/* ================================== main ================================== */
const SUITES = {
  'square-footage-calculator': squareFootage, 'sales-tax-calculator': salesTax, 'salary-to-hourly-calculator': salaryHourly,
  'fuel-cost-calculator': fuelCost, 'discount-calculator': discount, 'simple-interest-calculator': simpleInterest, markup
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
