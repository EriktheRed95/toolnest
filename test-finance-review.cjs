// Formula/input review of six previously untested finance calculators: CD, inflation,
// savings goal, emergency fund, loan-to-value and debt-to-income.
// Runs each tool's real inline script against a small DOM model and checks results against
// independent oracles (exact BigInt rational arithmetic, month-by-month simulation, integer
// loops) and against hand/Decimal-computed known values.
//   node test-finance-review.cjs                 (all suites)
//   node test-finance-review.cjs cd-calculator loan-to-value-calculator
// --root=DIR (or TN_ROOT) points the suite at another copy of the repo (e.g. a baseline);
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
    .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&rarr;/g, '→').replace(/&amp;/g, '&');
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
    set(id, val) { nodes[id].value = String(val); nodes[id].fire('input'); nodes[id].fire('change'); return this; },
    setAll(obj) { for (const [k, v] of Object.entries(obj)) this.set(k, v); return this; },
    html(id) { return nodes[id].innerHTML || nodes[id].textContent; },
    text(id) { return decode(this.html(id).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); },
    big(id) { const m = /class="result-big">([^<]*)</.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null; },
    sub(id) { const m = /class="result-sub">([^<]*)</.exec(nodes[id].innerHTML); return m ? decode(m[1]).trim() : null; },
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
const centsOf = s => Math.round(numOf(String(s).replace('−', '-')) * 100);
const alerted = (t, id) => /role="alert"/.test(t.html(id));
const money2 = x => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x);
const money0 = x => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
const fromCents = c => money2(c / 100);                       // exact: c is an integer
const fromCents0 = c => (c % 100 === 0 ? money0 : money2)(c / 100);
let seed = 20260930;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
// exact rational helpers (BigInt): round-half-up of num/den
const B = BigInt;
const halfUpB = (num, den) => (2n * num + den) / (2n * den);
// decimal string -> [numerator, denominator] (den a power of ten)
function dec(s) {
  const [i, f = ''] = String(s).split('.');
  return [B(i + f), 10n ** B(f.length)];
}
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
// Inputs that mean "nothing to calculate yet" prompt politely instead of alerting.
function prompts(t, outId, base, cases, where) {
  for (const [id, v] of cases) {
    t.setAll(base).set(id, v);
    ok(!alerted(t, outId) && t.big(outId) === null && /Enter/.test(t.text(outId)), `${where}: ${id}=${JSON.stringify(v)} prompts -> ` + t.text(outId).slice(0, 100));
    clean(t.html(outId), `${where}: ${id}=${JSON.stringify(v)}`);
  }
  t.setAll(base);
}

/* ============================== cd-calculator ============================== */
function cd() {
  const S = 'cd-calculator', t = tool(S);
  const base = { 'cd-deposit': '10000', 'cd-apy': '4.5', 'cd-years': '1' };
  const R = (d, a, y) => { t.setAll({ 'cd-deposit': d, 'cd-apy': a, 'cd-years': y }); return t.html('cd-out'); };
  // known values (Decimal arithmetic): 10,000 x 1.045 and x 1.045^2
  eq(t.big('cd-out'), '$10,450.00', 'default 10,000 at 4.5% for 1 year');
  eq(t.kv('cd-out', 'Total interest earned'), '$450.00'); eq(t.kv('cd-out', 'Deposit'), '$10,000.00');
  eq(t.kv('cd-out', 'APY'), '4.50%'); eq(t.kv('cd-out', 'Term'), '1 year');
  R('10000', '4.5', '2'); eq(t.big('cd-out'), '$10,920.25', '1.045^2'); eq(t.kv('cd-out', 'Total interest earned'), '$920.25'); eq(t.kv('cd-out', 'Term'), '2 years');
  // 5,000 x 1.05^3 is exactly 5,788.125: a half cent, which must round up (binary noise gives 5,788.12)
  R('5000', '5', '3'); eq(t.big('cd-out'), '$5,788.13', '5,000 at 5% for 3 years = 5,788.125'); eq(t.kv('cd-out', 'Total interest earned'), '$788.13');
  R('10000', '4.5', '0.5'); eq(t.big('cd-out'), '$10,222.52', 'half a year = sqrt(1.045)'); eq(t.kv('cd-out', 'Term'), '0.5 years');
  R('25000', '3.75', '2.5'); eq(t.big('cd-out'), '$27,410.08', '25,000 at 3.75% for 2.5 years');
  R('10000', '0', '5'); eq(t.big('cd-out'), '$10,000.00', '0% APY leaves the deposit unchanged'); eq(t.kv('cd-out', 'Total interest earned'), '$0.00');
  R('10000', '4.125', '1'); eq(t.kv('cd-out', 'APY'), '4.125%', 'APY is shown as entered, not rounded to 4.13%'); eq(t.big('cd-out'), '$10,412.50');
  R('999.99', '4.5', '1'); eq(t.kv('cd-out', 'Deposit'), '$999.99'); eq(t.big('cd-out'), '$1,044.99', '999.99 x 1.045 = 1044.98955');
  // tiny deposit keeps its cents and the lines add up
  R('0.01', '100', '1'); eq(t.big('cd-out'), '$0.02'); eq(t.kv('cd-out', 'Total interest earned'), '$0.01');
  // a blank is an error, not silently 0; zero deposit/term simply prompts
  refuses(t, 'cd-out', base, [['cd-deposit', ''], ['cd-apy', ''], ['cd-years', ''], ['cd-deposit', '-100'], ['cd-apy', '-1'], ['cd-apy', '-150'],
    ['cd-years', '-1'], ['cd-deposit', '1e309'], ['cd-apy', '1e309'], ['cd-years', '1e309'], ['cd-apy', '101'], ['cd-years', '101'], ['cd-deposit', '2e12'],
    ['cd-deposit', 'abc']], S);
  // the result itself must stay displayable: $1 trillion at 100% APY for 100 years does not
  t.setAll({ 'cd-deposit': '1e12', 'cd-apy': '100', 'cd-years': '100' });
  ok(alerted(t, 'cd-out') && !JUNK.test(t.html('cd-out')), 'astronomical maturity value is refused, not printed');
  t.setAll(base);
  prompts(t, 'cd-out', base, [['cd-deposit', '0'], ['cd-years', '0']], S);
  // exact rational oracle: integer-year terms, APY in hundredths of a percent, deposits in cents
  for (let k = 0; k < 1500; k++) {
    const n = rint(1, 12), ah = rint(0, 1200), Dc = rint(1, 50000000);
    R((Dc / 100).toFixed(2), (ah / 100).toFixed(2), String(n));
    const mat = halfUpB(B(Dc) * B(10000 + ah) ** B(n), 10000n ** B(n));
    eq(t.big('cd-out'), fromCents(Number(mat)), `sweep ${Dc / 100} @ ${ah / 100}% x ${n}y`);
    eq(centsOf(t.kv('cd-out', 'Deposit')) + centsOf(t.kv('cd-out', 'Total interest earned')), centsOf(t.big('cd-out')), `sweep lines add up ${Dc / 100} @ ${ah / 100}% x ${n}y`);
  }
  // deliberate half-cent ties: 5,000 x 1.05^3 style (n=1 with a hundredths APY gives many exact ties)
  let ties = 0;
  for (let k = 0; k < 400; k++) {
    const ah = rint(1, 999); let Dc = rint(100, 2000000);
    while ((Dc * ah) % 10000 !== 5000 && Dc < 2100000) Dc++;          // deposit x (1 + APY) lands exactly on a half cent
    if ((Dc * ah) % 10000 !== 5000) continue;
    ties++;
    R((Dc / 100).toFixed(2), (ah / 100).toFixed(2), '1');
    eq(t.big('cd-out'), fromCents(Number(halfUpB(B(Dc) * B(10000 + ah), 10000n))), `tie sweep ${Dc / 100} @ ${ah / 100}%`);
  }
  ok(ties > 100, 'the tie sweep found exact half-cent cases (' + ties + ')');
  // fractional terms: compare with the closed form to well under a cent
  for (let k = 0; k < 300; k++) {
    const y = rint(1, 120) / 12, ap = rint(0, 900) / 100, d = rint(1000, 5000000) / 100;
    R(String(d), String(ap), String(y));
    const want = d * Math.exp(y * Math.log1p(ap / 100));
    ok(Math.abs(numOf(t.big('cd-out')) - want) <= 0.0051 + 1e-12 * want, `fractional term ${d} @ ${ap}% x ${y}y`);
  }
}

/* =========================== inflation-calculator =========================== */
function inflation() {
  const S = 'inflation-calculator', t = tool(S);
  const base = { 'if-amount': '10000', 'if-years': '20', 'if-rate': '3' };
  const R = (a, y, r) => { t.setAll({ 'if-amount': a, 'if-years': y, 'if-rate': r }); return t.html('if-out'); };
  // Decimal: 1.03^20 = 1.80611123467; 10,000 -> 18,061.11 and 5,536.76 of buying power
  eq(t.big('if-out'), '$18,061', 'default 10,000 at 3% for 20 years');
  eq(t.kv('if-out', 'Cost of the same goods later'), '$18,061'); eq(t.kv('if-out', 'Price increase'), '+80.6%');
  eq(t.kv('if-out', 'Buying power of'), '$5,537 (today’s dollars)', '10,000 / 1.8061'); eq(t.kv('if-out', 'Purchasing power lost'), '−44.6%');
  ok(/to buy the same goods in 20 years/.test(t.text('if-out')), 'years wording');
  // small amounts keep their cents: $5 must not turn into "$6" / "$4"
  R('5', '10', '2.5'); eq(t.big('if-out'), '$6.40', '5 x 1.025^10 = 6.4004'); eq(t.kv('if-out', 'Buying power of'), '$3.91 (today’s dollars)');
  R('100', '1', '3'); eq(t.big('if-out'), '$103.00'); eq(t.kv('if-out', 'Buying power of'), '$97.09 (today’s dollars)', '100/1.03 = 97.087'); eq(t.kv('if-out', 'Price increase'), '+3.0%');
  ok(/in 1 year\b/.test(t.text('if-out')) && !/1 years/.test(t.text('if-out')), 'singular year');
  // a fractional term is honoured (old code silently rounded 0.5 to 1 year and 2.5 to 3)
  R('1000', '0.5', '4'); eq(t.big('if-out'), '$1,020', '1000 x 1.04^0.5 = 1019.80'); eq(t.kv('if-out', 'Price increase'), '+2.0%');
  eq(t.kv('if-out', 'Buying power of'), '$981 (today’s dollars)', '1000/1.0198 = 980.58'); ok(/0\.5 years/.test(t.text('if-out')), 'fractional years are reported as entered');
  // Decimal: 10,000 x 1.02^2.5 = 10,507.52 (power 9,516.99); 10,000 x 1.01^100 = 27,048.14 (power 3,697.11)
  R('10000', '2.5', '2'); eq(t.big('if-out'), '$10,508', 'amount 10,000, 2.5 years at 2%'); eq(t.kv('if-out', 'Buying power of'), '$9,517 (today’s dollars)'); eq(t.kv('if-out', 'Price increase'), '+5.1%');
  R('10000', '100', '1'); eq(t.big('if-out'), '$27,048', '100 years at 1%'); eq(t.kv('if-out', 'Buying power of'), '$3,697 (today’s dollars)'); eq(t.kv('if-out', 'Purchasing power lost'), '−63.0%');
  R('10000', '5', '0'); eq(t.big('if-out'), '$10,000', '0% inflation'); eq(t.kv('if-out', 'Purchasing power lost'), '−0.0%');
  refuses(t, 'if-out', base, [['if-amount', ''], ['if-years', ''], ['if-rate', ''], ['if-amount', '-1'], ['if-years', '-5'], ['if-rate', '-1'], ['if-rate', '-150'],
    ['if-amount', '1e309'], ['if-years', '1e309'], ['if-rate', '1e309'], ['if-years', '101'], ['if-rate', '1001'], ['if-amount', '2e12'], ['if-amount', 'x']], S);
  t.setAll({ 'if-amount': '1e12', 'if-years': '100', 'if-rate': '1000' });
  ok(alerted(t, 'if-out') && !JUNK.test(t.html('if-out')), 'astronomical cost is refused, not printed');
  t.setAll({ 'if-amount': '0.01', 'if-years': '100', 'if-rate': '1000' });
  ok(alerted(t, 'if-out') && !JUNK.test(t.html('if-out')), 'tiny amount with a huge factor never prints an exponent figure');
  t.setAll(base);
  prompts(t, 'if-out', base, [['if-amount', '0'], ['if-years', '0']], S);
  // exact rational oracle: integer years, rate in hundredths of a percent, amount in cents
  for (let k = 0; k < 1200; k++) {
    const n = rint(1, 40), rh = rint(0, 1500), Ac = rint(1, 2000000);
    const cents = Ac / 100, r = (rh / 100).toFixed(2);
    R(cents.toFixed(2), String(n), r);
    const f =(1 + rh / 10000) ** n, fut = cents * f, pow = cents / f, tol = (cents < 1000 ? 0.005 : 0.5) * (1 + 1e-9) + 1e-9 * fut;
    ok(Math.abs(numOf(t.big('if-out')) - fut) <= tol, `sweep cost ${cents} @ ${r}% x ${n}y -> ${t.big('if-out')} vs ${fut}`);
    ok(Math.abs(numOf(t.kv('if-out', 'Buying power of')) - pow) <= tol, `sweep power ${cents} @ ${r}% x ${n}y -> ${t.kv('if-out', 'Buying power of')} vs ${pow}`);
    ok(Math.abs(numOf(t.kv('if-out', 'Price increase')) - (f - 1) * 100) <= 0.0501 + 1e-9 * f * 100, `sweep % increase ${r}% x ${n}y`);
    ok(Math.abs(Math.abs(numOf(t.kv('if-out', 'Purchasing power lost'))) - (1 - 1 / f) * 100) <= 0.0501, `sweep % lost ${r}% x ${n}y`);
  }
}

/* ========================== savings-goal-calculator ========================== */
function savingsGoal() {
  const S = 'savings-goal-calculator', t = tool(S);
  const base = { 'sg-goal': '30000', 'sg-current': '5000', 'sg-years': '5', 'sg-apy': '4' };
  const R = (g, c, y, a) => { t.setAll({ 'sg-goal': g, 'sg-current': c, 'sg-years': y, 'sg-apy': a }); return t.html('sg-out'); };
  // Decimal oracle: monthly rate (1.04)^(1/12)-1 (APY is an effective yield), 60 end-of-month deposits
  eq(t.big('sg-out'), '$361.40', '30,000 goal, 5,000 saved, 5 years at 4% APY (exact 361.3945, rounded up)');
  eq(t.kv('sg-out', 'Target'), '$30,000.00'); eq(t.kv('sg-out', 'Current savings'), '$5,000.00'); eq(t.kv('sg-out', 'Time horizon'), '5 years');
  eq(t.kv('sg-out', 'Total you'), '$21,684.00', '361.40 x 60'); eq(t.kv('sg-out', 'Interest earned'), '$3,316.36'); eq(t.kv('sg-out', 'Projected balance'), '$30,000.36', '5,000 + 21,684 + 3,316.36');
  // the old APY/12 monthly rate would have shown 360.42 (overstating the yield of a 4% APY)
  ok(t.big('sg-out') !== '$360.42' && t.big('sg-out') !== '$360.41', 'APY is an effective yield, not APR divided by 12');
  R('10000', '0', '2', '0'); eq(t.big('sg-out'), '$416.67', '0% APY: 10,000 / 24 = 416.667'); eq(t.kv('sg-out', 'Total you'), '$10,000.08'); eq(t.kv('sg-out', 'Interest earned'), '$0.00');
  R('50000', '10000', '10', '5'); eq(t.big('sg-out'), '$218.39'); eq(t.kv('sg-out', 'Total you'), '$26,206.80'); eq(t.kv('sg-out', 'Interest earned'), '$13,793.52'); eq(t.kv('sg-out', 'Projected balance'), '$50,000.32');
  R('1000', '0', '0.5', '3'); eq(t.big('sg-out'), '$165.65', 'half a year = 6 months'); eq(t.kv('sg-out', 'Time horizon'), '6 months'); eq(t.kv('sg-out', 'Total you'), '$993.90'); eq(t.kv('sg-out', 'Interest earned'), '$6.15');
  R('10000', '9000', '1', '4'); eq(t.big('sg-out'), '$52.38'); eq(t.kv('sg-out', 'Time horizon'), '1 year'); eq(t.kv('sg-out', 'Interest earned'), '$371.44'); eq(t.kv('sg-out', 'Projected balance'), '$10,000.00');
  R('1000', '', '0.5', '3'); ok(!alerted(t, 'sg-out'), 'blank current savings is optional'); eq(t.big('sg-out'), '$165.65', 'blank current savings = $0');
  R('1000', '0', '1.5', '3'); eq(t.kv('sg-out', 'Time horizon'), '18 months');
  R('1000', '0', '0.0833', '3'); eq(t.kv('sg-out', 'Time horizon'), '1 month', '0.0833 years rounds to one month');
  // already there: current savings alone reach the goal
  R('6000', '5000', '5', '4'); eq(t.big('sg-out'), '$0.00'); eq(t.kv('sg-out', 'Projected from current savings'), '$6,083.26'); ok(/No additional saving required/.test(t.text('sg-out')), 'no saving needed');
  R('5000', '5000', '1', '0'); eq(t.big('sg-out'), '$0.00', 'current == goal at 0% needs nothing');
  R('10000', '4000', '5', '100'); eq(t.big('sg-out'), '$0.00', 'huge APY: savings alone win');
  refuses(t, 'sg-out', base, [['sg-goal', ''], ['sg-years', ''], ['sg-apy', ''], ['sg-goal', '-1'], ['sg-current', '-1'], ['sg-years', '0'], ['sg-years', '-2'], ['sg-years', '0.04'], ['sg-years', '61'],
    ['sg-apy', '-1'], ['sg-apy', '-150'], ['sg-apy', '101'], ['sg-goal', '1e309'], ['sg-current', '1e309'], ['sg-years', '1e309'], ['sg-apy', '1e309'], ['sg-goal', '2e12'], ['sg-current', 'x']], S);
  t.setAll({ 'sg-goal': '1e12', 'sg-current': '1e12', 'sg-years': '60', 'sg-apy': '100' });
  ok(alerted(t, 'sg-out') && !JUNK.test(t.html('sg-out')), 'astronomical projected balance is refused');
  t.setAll(base);
  prompts(t, 'sg-out', base, [['sg-goal', '0']], S);
  // tiny rates keep full precision (the closed form must not cancel to 0 or NaN)
  R('12000', '0', '1', '1e-9'); ok(!alerted(t, 'sg-out') && Math.abs(numOf(t.big('sg-out')) - 1000) <= 0.01, 'near-zero APY ~ goal / months -> ' + t.big('sg-out'));
  // Independent oracle: month-by-month simulation of end-of-month deposits at (1 + APY)^(1/12) - 1.
  // The displayed payment must reach the goal, and one cent less must not.
  const simulate = (cur, pay, N, a) => { const i = Math.pow(1 + a, 1 / 12) - 1; let bal = cur; for (let m = 0; m < N; m++) bal = bal * (1 + i) + pay; return bal; };
  let reached = 0, funded = 0;
  for (let k = 0; k < 1500; k++) {
    const goal = rint(1000, 2000000), cur = rint(0, goal), N = rint(1, 360), apyH = rint(0, 1200);
    const years = N % 12 === 0 ? String(N / 12) : (N / 12).toFixed(6), a = apyH / 10000;
    R(String(goal), String(cur), years, (apyH / 100).toFixed(2));
    const here = `sweep goal ${goal} cur ${cur} N ${N} apy ${apyH / 100}`;
    if (simulate(cur, 0, N, a) >= goal - 0.005) { eq(t.big('sg-out'), '$0.00', here + ' already funded'); funded++; continue; }
    reached++;
    const pay = centsOf(t.big('sg-out')) / 100, contrib = centsOf(t.kv('sg-out', 'Total you')), bal = centsOf(t.kv('sg-out', 'Projected balance'));
    ok(simulate(cur, pay, N, a) >= goal - 1e-6, here + ' payment reaches the goal');
    ok(pay <= 0.01 + 1e-9 || simulate(cur, pay - 0.01, N, a) < goal + 1e-6, here + ' one cent less does not (minimal payment)');
    eq(contrib, Math.round(pay * 100) * N, here + ' contributions = payment x months');
    ok(Math.abs(bal / 100 - simulate(cur, pay, N, a)) <= 0.0051 + 1e-9 * bal, here + ' projected balance matches the simulation');
    eq(centsOf(t.kv('sg-out', 'Current savings')) + contrib + centsOf(t.kv('sg-out', 'Interest earned')), bal, here + ' lines add up');
    ok(centsOf(t.kv('sg-out', 'Interest earned')) >= 0, here + ' interest is never negative');
  }
  ok(reached > 600 && funded > 50, `the sweep exercised both branches (payment ${reached}, already funded ${funded})`);
}

/* ========================== emergency-fund-calculator ========================== */
function emergencyFund() {
  const S = 'emergency-fund-calculator', t = tool(S);
  const base = { 'ef-exp': '3500', 'ef-months': '6', 'ef-current': '5000', 'ef-contrib': '0' };
  const R = (e, m, c, k) => { t.setAll({ 'ef-exp': e, 'ef-months': m, 'ef-current': c, 'ef-contrib': k }); return t.html('ef-out'); };
  eq(t.big('ef-out'), '$21,000', '3,500 x 6'); eq(t.kv('ef-out', 'Current savings'), '$5,000'); eq(t.kv('ef-out', 'Remaining gap'), '$16,000');
  eq(t.kv('ef-out', 'Time to reach goal'), null, 'no timeline without a contribution'); ok(/\$16,000 short/.test(t.text('ef-out')), 'short-fall note');
  R('3500', '6', '5000', '1600'); eq(t.kv('ef-out', 'Time to reach goal'), '10 mo at $1,600/mo', '16,000 / 1,600');
  R('3500', '6', '5000', '1000'); eq(t.kv('ef-out', 'Time to reach goal'), '1 yr 4 mo at $1,000/mo', '16 months');
  R('3500', '6', '5000', '1500'); eq(t.kv('ef-out', 'Time to reach goal'), '11 mo at $1,500/mo', '10.67 -> 11');
  R('3500', '6', '5000', '1333'); eq(t.kv('ef-out', 'Time to reach goal'), '1 yr 1 mo at $1,333/mo', '12.003 -> 13');
  R('3500', '6', '5000', '16000'); eq(t.kv('ef-out', 'Time to reach goal'), '1 mo at $16,000/mo');
  R('3500', '6', '5000', '1333.33'); eq(t.kv('ef-out', 'Time to reach goal'), '1 yr 1 mo at $1,333.33/mo', '16,000 / 1,333.33 = 12.00003 -> 13');
  R('3500', '6', '5000', '1333.3333'); eq(t.kv('ef-out', 'Time to reach goal'), '1 yr 1 mo at $1,333.33/mo', 'contribution is taken to the cent');
  R('3500', '6', '5000', '1'); eq(t.kv('ef-out', 'Time to reach goal'), 'More than 100 years at $1/mo');
  ok(/interest/.test(t.text('ef-out')), 'the timeline says it ignores interest');
  // binary noise: 100 - 99.93 = 0.07000000000000739, so a 1-cent contribution took "8 months" instead of 7
  R('100', '1', '99.93', '0.01'); eq(t.kv('ef-out', 'Remaining gap'), '$0.07'); eq(t.kv('ef-out', 'Time to reach goal'), '7 mo at $0.01/mo', 'exact cents division');
  R('3.3', '3', '0', '0.3'); eq(t.big('ef-out'), '$9.90'); eq(t.kv('ef-out', 'Time to reach goal'), '2 yrs 9 mo at $0.30/mo', '9.90 / 0.30 = 33');
  // fully funded, exactly and above; the gap never goes negative
  R('3500', '6', '21000', '0'); eq(t.kv('ef-out', 'Status'), 'Fully funded', 'exactly at target'); eq(t.kv('ef-out', 'Remaining gap'), '$0');
  R('3500', '6', '25000', '500'); eq(t.kv('ef-out', 'Status'), 'Fully funded'); eq(t.kv('ef-out', 'Time to reach goal'), null);
  // a sub-dollar gap must not read "$0 short"
  R('3500', '6', '20999.6', '0'); eq(t.kv('ef-out', 'Remaining gap'), '$0.40', 'cents kept'); ok(/\$0\.40 short/.test(t.text('ef-out')), 'short by $0.40'); ok(!t.kv('ef-out', 'Status'), 'not fully funded');
  // fractional months of coverage: 3,333.33 x 4.5 = 14,999.985 -> half cent rounds up
  R('3333.33', '4.5', '0', '0'); eq(t.big('ef-out'), '$14,999.99', '14,999.985 rounds up'); ok(/4\.5-month|short/.test(t.text('ef-out')));
  R('3500', '6', '', ''); ok(!alerted(t, 'ef-out'), 'blank current savings and contribution are optional'); eq(t.kv('ef-out', 'Remaining gap'), '$21,000');
  refuses(t, 'ef-out', base, [['ef-exp', ''], ['ef-months', ''], ['ef-exp', '-1'], ['ef-months', '0'], ['ef-months', '0.5'], ['ef-months', '-6'], ['ef-months', '121'], ['ef-current', '-5'],
    ['ef-contrib', '-50'], ['ef-exp', '1e309'], ['ef-months', '1e309'], ['ef-current', '1e309'], ['ef-contrib', '1e309'], ['ef-exp', '2e9'], ['ef-current', '2e12'], ['ef-contrib', '2e9'], ['ef-exp', 'x']], S);
  prompts(t, 'ef-out', base, [['ef-exp', '0']], S);
  // integer-loop oracle: fewest whole months m with current + m x contribution >= target
  for (let k = 0; k < 1200; k++) {
    const expC = rint(100, 600000), mo = rint(1, 12), curC = rint(0, expC * mo), ctC = rint(1, Math.max(1, Math.floor(expC * mo / 40)));
    R((expC / 100).toFixed(2), String(mo), (curC / 100).toFixed(2), (ctC / 100).toFixed(2));
    const targetC = expC * mo, here = `sweep exp ${expC / 100} x ${mo}, have ${curC / 100}, add ${ctC / 100}`;
    eq(t.big('ef-out'), fromCents0(targetC), here + ' target');
    eq(t.kv('ef-out', 'Remaining gap'), fromCents0(Math.max(0, targetC - curC)), here + ' gap');
    if (curC >= targetC) { eq(t.kv('ef-out', 'Status'), 'Fully funded', here); continue; }
    let m = 0; while (curC + m * ctC < targetC && m < 5000) m++;
    const want = m > 1200 ? 'More than 100 years' : (m >= 12 ? Math.floor(m / 12) + ' yr' + (Math.floor(m / 12) === 1 ? '' : 's') + ' ' : '') + (m % 12) + ' mo';
    eq(t.kv('ef-out', 'Time to reach goal'), want + ' at ' + fromCents0(ctC) + '/mo', here + ' months to reach');
  }
}

/* =========================== loan-to-value-calculator =========================== */
function loanToValue() {
  const S = 'loan-to-value-calculator', t = tool(S);
  const base = { 'ltv-loan': '320000', 'ltv-value': '400000' };
  const R = (l, v) => { t.setAll({ 'ltv-loan': l, 'ltv-value': v }); return t.html('ltv-out'); };
  const OK80 = /80% LTV or below/, PMI = /Above 80% LTV/, FHA = /above the 96\.5% FHA limit/, NEG = /negative equity/;
  eq(t.big('ltv-out'), '80.00%', '320,000 / 400,000'); eq(t.kv('ltv-out', 'Equity'), '$80,000'); eq(t.kv('ltv-out', 'Equity %'), '20.00%');
  eq(t.kv('ltv-out', 'Loan amount'), '$320,000'); eq(t.kv('ltv-out', 'Property value'), '$400,000'); ok(OK80.test(t.text('ltv-out')), 'exactly 80% is at or below 80%');
  R('320001', '400000'); ok(PMI.test(t.text('ltv-out')) && !OK80.test(t.text('ltv-out')), 'just above 80% needs PMI');
  R('386000', '400000'); eq(t.big('ltv-out'), '96.50%'); ok(PMI.test(t.text('ltv-out')) && !FHA.test(t.text('ltv-out')), 'exactly 96.5% is within the FHA limit');
  R('386001', '400000'); ok(FHA.test(t.text('ltv-out')), 'just above 96.5% exceeds the FHA limit'); eq(t.kv('ltv-out', 'Equity %'), '3.50%');
  R('400000', '400000'); eq(t.big('ltv-out'), '100.00%'); eq(t.kv('ltv-out', 'Equity'), '$0'); ok(FHA.test(t.text('ltv-out')) && !NEG.test(t.text('ltv-out')), '100% LTV: limit note, no negative equity');
  // exact-boundary inputs on which floating point (loan / value * 100 = 80.00000000000001 / 96.50000000000001) misclassified
  R('831.08', '1038.85'); eq(t.big('ltv-out'), '80.00%'); ok(OK80.test(t.text('ltv-out')) && !PMI.test(t.text('ltv-out')), '831.08 / 1,038.85 is exactly 80%');
  R('1036.41', '1074'); eq(t.big('ltv-out'), '96.50%'); ok(!FHA.test(t.text('ltv-out')) && PMI.test(t.text('ltv-out')), '1,036.41 / 1,074 is exactly 96.5%');
  // underwater
  R('450000', '400000'); eq(t.big('ltv-out'), '112.50%'); eq(t.kv('ltv-out', 'Equity'), '-$50,000'); eq(t.kv('ltv-out', 'Equity %'), '-12.50%'); ok(NEG.test(t.text('ltv-out')), 'negative-equity note');
  R('0', '400000'); ok(!alerted(t, 'ltv-out'), 'an explicit $0 loan is valid'); eq(t.big('ltv-out'), '0.00%'); eq(t.kv('ltv-out', 'Equity'), '$400,000'); eq(t.kv('ltv-out', 'Equity %'), '100.00%'); ok(OK80.test(t.text('ltv-out')));
  R('250000.50', '300000'); eq(t.big('ltv-out'), '83.33%', '250,000.50 / 300,000 = 83.3335'); eq(t.kv('ltv-out', 'Loan amount'), '$250,000.50', 'cents are kept'); eq(t.kv('ltv-out', 'Equity'), '$49,999.50');
  // two decimals stay consistent with the note: 80.04% is shown as 80.04%, never as "80.0%" beside a PMI warning
  R('320160', '400000'); eq(t.big('ltv-out'), '80.04%'); ok(PMI.test(t.text('ltv-out')));
  refuses(t, 'ltv-out', base, [['ltv-loan', ''], ['ltv-value', ''], ['ltv-loan', '-1'], ['ltv-value', '-400000'], ['ltv-loan', '1e309'], ['ltv-value', '1e309'], ['ltv-loan', '-1e309'],
    ['ltv-loan', '2e10'], ['ltv-value', '2e10'], ['ltv-loan', 'x']], S);
  prompts(t, 'ltv-out', base, [['ltv-value', '0']], S);
  // exact BigInt oracle over random cents amounts and designed boundary ratios
  const cases = [];
  for (let k = 0; k < 1200; k++) { const V = rint(100, 400000000); cases.push([rint(0, Math.floor(V * 1.3)), V]); }
  for (let k = 0; k < 800; k++) { const V = 20 * rint(5, 20000000); cases.push([Math.floor(V * 8 / 10) + rint(-1, 1), V]); }      // around 80%
  for (let k = 0; k < 800; k++) { const V = 200 * rint(1, 2000000); cases.push([Math.floor(V * 965 / 1000) + rint(-1, 1), V]); } // around 96.5%
  for (const [L, V] of cases) {
    R((L / 100).toFixed(2), (V / 100).toFixed(2));
    const here = `sweep loan ${L / 100} value ${V / 100}`;
    eq(t.big('ltv-out'), (Number(halfUpB(B(L) * 10000n, B(V))) / 100).toFixed(2) + '%', here + ' LTV');
    // percentages round half away from zero (toFixed), so negative equity is rounded on its magnitude
    const eqNum = B(V - L) * 10000n, eqH = eqNum < 0n ? -halfUpB(-eqNum, B(V)) : halfUpB(eqNum, B(V));
    eq(t.kv('ltv-out', 'Equity %'), (Number(eqH) / 100).toFixed(2) + '%', here + ' equity %');
    eq(t.kv('ltv-out', 'Equity'), (V - L) < 0 ? '-' + fromCents0(L - V) : fromCents0(V - L), here + ' equity');
    const txt = t.text('ltv-out'), want = L * 10 <= V * 8 ? OK80 : L * 1000 <= V * 965 ? PMI : L <= V ? FHA : NEG;
    ok(want.test(txt) && [OK80, PMI, FHA, NEG].filter(r => r.test(txt)).length === 1, here + ' classification');
  }
}

/* =========================== debt-to-income-calculator =========================== */
function debtToIncome() {
  const S = 'debt-to-income-calculator', t = tool(S);
  const base = { 'd-income': '7500', 'd-housing': '2000', 'd-car': '450', 'd-cards': '150', 'd-student': '250', 'd-other': '0' };
  const R = (inc, h, c, cc, s, o) => { t.setAll({ 'd-income': inc, 'd-housing': h, 'd-car': c, 'd-cards': cc, 'd-student': s, 'd-other': o }); return t.html('d-out'); };
  const only = (inc, h) => R(inc, h, '', '', '', '');
  const label = () => (/ Excellent| Acceptable| Very high| High/.exec(t.sub('d-out')) || [''])[0].trim();
  // 2,850 / 7,500 = 38%; housing 2,000 / 7,500 = 26.67%; headroom to 43% = 3,225 - 2,850 = 375
  eq(t.big('d-out'), '38.00%'); eq(t.kv('d-out', 'Front-end'), '26.67%'); eq(t.kv('d-out', 'Back-end'), '38.00%');
  eq(t.kv('d-out', 'Total monthly debt'), '$2,850'); eq(t.kv('d-out', 'Gross monthly income'), '$7,500'); eq(label(), 'Acceptable');
  ok(/roughly \$375\/mo of debt-payment room/.test(t.text('d-out')), 'room to 43% -> ' + t.text('d-out'));
  only('7500', '2700'); eq(t.big('d-out'), '36.00%'); eq(label(), 'Excellent', 'exactly 36%'); ok(/at or under the 36% mark/.test(t.text('d-out')));
  only('10000', '3601'); eq(t.big('d-out'), '36.01%', 'shown to two decimals (36.0% beside "Acceptable" was contradictory)'); eq(label(), 'Acceptable');
  only('7500', '3225'); eq(t.big('d-out'), '43.00%'); eq(label(), 'Acceptable', 'exactly 43%'); ok(!/room/.test(t.text('d-out')), 'no headroom at exactly 43%');
  only('10000', '4301'); eq(label(), 'High'); ok(/above the common 43% limit/.test(t.text('d-out')));
  only('1000', '500'); eq(label(), 'High', 'exactly 50%'); only('1000', '500.10'); eq(t.big('d-out'), '50.01%'); eq(label(), 'Very high');
  // exact-boundary inputs on which floating point (debt / income * 100 = 36.00000000000001 / 43.00000000000001) misclassified
  R('1202', '144.24', '288.48', '', '', ''); eq(t.big('d-out'), '36.00%'); eq(label(), 'Excellent', 'cents that sum to exactly 36%');
  R('2010', '288.1', '576.2', '', '', ''); eq(t.big('d-out'), '43.00%'); eq(label(), 'Acceptable', 'cents that sum to exactly 43%');
  // the headroom line once read "roughly $0/mo" at 43% because 0.43 x income left 1e-13 over
  R('1606', '230.19', '460.39', '', '', ''); eq(t.big('d-out'), '43.00%'); ok(!/room/.test(t.text('d-out')), 'no phantom $0 headroom');
  R('7500', '2000', '', '', '', ''); ok(!alerted(t, 'd-out'), 'blank debt fields mean none'); eq(t.kv('d-out', 'Total monthly debt'), '$2,000');
  R('7500', '', '', '', '', ''); ok(!alerted(t, 'd-out'), 'no debts at all is valid (renter with no payments)'); eq(t.big('d-out'), '0.00%'); eq(label(), 'Excellent');
  R('5000', '1000.50', '', '', '', ''); eq(t.kv('d-out', 'Total monthly debt'), '$1,000.50', 'cents are kept'); eq(t.kv('d-out', 'Front-end'), '20.01%');
  R('3000.75', '1000', '', '', '', ''); eq(t.kv('d-out', 'Gross monthly income'), '$3,000.75');
  refuses(t, 'd-out', base, [['d-income', ''], ['d-income', '-7500'], ['d-income', '1e309'], ['d-income', '2e9'], ['d-income', 'x'], ['d-housing', '-1'], ['d-car', '-450'], ['d-cards', '-1'],
    ['d-student', '-250'], ['d-other', '-5'], ['d-housing', '1e309'], ['d-car', '1e309'], ['d-other', '-1e309'], ['d-housing', '2e9'], ['d-student', 'x']], S);
  prompts(t, 'd-out', base, [['d-income', '0']], S);
  // exact BigInt oracle with up to five debts, random cents, and designed 36% / 43% / 50% boundaries
  const cases = [];
  for (let k = 0; k < 1000; k++) { const inc = rint(100000, 3000000), ds = [0, 0, 0, 0, 0].map(() => rint(0, 1) ? rint(0, Math.floor(inc / 4)) : 0); cases.push([inc, ds]); }
  for (const pct of [36, 43, 50]) for (let k = 0; k < 500; k++) {
    const inc = 100 * rint(500, 30000), tot = inc * pct / 100 + rint(-1, 1), a = rint(0, tot), b = rint(0, tot - a);
    cases.push([inc, [a, b, tot - a - b, 0, 0]]);
  }
  for (const [inc, ds] of cases) {
    R((inc / 100).toFixed(2), ...ds.map(d => (d / 100).toFixed(2)));
    const tot = ds.reduce((x, y) => x + y, 0), here = `sweep income ${inc / 100} debts ${ds.map(d => d / 100)}`;
    eq(t.big('d-out'), (Number(halfUpB(B(tot) * 10000n, B(inc))) / 100).toFixed(2) + '%', here + ' back-end');
    eq(t.kv('d-out', 'Front-end'), (Number(halfUpB(B(ds[0]) * 10000n, B(inc))) / 100).toFixed(2) + '%', here + ' front-end');
    eq(t.kv('d-out', 'Total monthly debt'), fromCents0(tot), here + ' total debt');
    const want = tot * 100 <= 36 * inc ? 'Excellent' : tot * 100 <= 43 * inc ? 'Acceptable' : tot * 100 <= 50 * inc ? 'High' : 'Very high';
    eq(label(), want, here + ' label');
    const room = Math.floor(inc * 43 / 100) - tot, m = /roughly ([^ ]+)\/mo of debt-payment room/.exec(t.text('d-out'));
    if (room > 0) eq(m && m[1], fromCents0(room), here + ' room to 43%'); else ok(!m, here + ' no room line when at or above 43%');
  }
}

/* ===================== markup, accessibility and layout ===================== */
function markup() {
  const slugs = ['cd-calculator', 'inflation-calculator', 'savings-goal-calculator', 'emergency-fund-calculator', 'loan-to-value-calculator', 'debt-to-income-calculator'];
  for (const s of slugs) {
    const { src, code } = source(s);
    // every control has an explicit <label for>, or sits inside a <label>
    for (const m of src.matchAll(/<input\b([^>]*)>/g)) {
      const id = attrsOf(m[1]).id, before = src.slice(0, m.index);
      const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
      ok(wrapped || src.includes('<label for="' + id + '">') || new RegExp('<label for="' + id + '">').test(src), s + ': #' + id + ' has a label');
      ok(attrsOf(m[1]).type === 'number', s + ': #' + id + ' is a number field');
    }
    // live results are announced politely; every error path uses role="alert"
    const results = [...src.matchAll(/<div class="result"[^>]*>/g)].map(m => m[0]);
    ok(results.length === 1, s + ': has one result box');
    for (const r of results) ok(/aria-live="polite"/.test(r), s + ': result is a polite live region -> ' + r);
    ok(/role="alert"/.test(code.join('')), s + ': errors use role="alert"');
    // narrow screens: no fixed pixel widths, no nowrap, no wide tables inside the result markup
    ok(!/white-space\s*:\s*nowrap|[^-]width\s*:\s*\d+px|min-width\s*:\s*\d+px/.test(src), s + ': no fixed-width layout in the tool markup');
    ok(!/<table/.test(src), s + ': no tables');
    // percent inputs are capped so the page itself flags impossible values
    for (const m of src.matchAll(/<input\b([^>]*)>/g)) { const a = attrsOf(m[1]); if (/apy|rate/.test(a.id)) ok('max' in a, s + ': #' + a.id + ' has a max'); }
    // the generated page is in sync with the source (build.py was run)
    const docs = path.join(ROOT, 'docs', s, 'index.html');
    if (fs.existsSync(docs)) { const d = fs.readFileSync(docs, 'utf8'); for (const c of code) ok(d.includes(c), s + ': docs/ page is rebuilt from current source'); }
  }
  ok(/effective yearly yield/.test(source('savings-goal-calculator').src), 'savings goal states that APY is treated as an effective yield');
  // long currency strings must be able to wrap instead of widening a 320 px viewport
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
  const rule = sel => { const m = new RegExp('(?:^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'm').exec(css); return m ? m[1] : ''; };
  ok(/overflow-wrap:anywhere/.test(rule('.result-big')), '.result-big can wrap long numbers');
  ok(/overflow-wrap:anywhere/.test(rule('.kv .v')), '.kv .v can wrap long numbers');
  ok(/flex-wrap:wrap/.test(rule('.row')) && /min-width:\s*140px/.test(rule('.row>.field')), '.row wraps to one column on narrow screens');
}

/* ============ largest accepted inputs (the 320 px worst cases) ============ */
// The longest figures each tool can be asked to print must render cleanly (no NaN/Infinity/exponent)
// and every result must be plain text that the CSS can wrap.
function extremes() {
  const big = (slug, outId, vals, bigWant, extra) => {
    const t = tool(slug); t.setAll(vals);
    ok(!alerted(t, outId), slug + ': largest accepted input is not refused -> ' + t.text(outId).slice(0, 100));
    clean(t.html(outId), slug + ' largest input'); ok(!/\d[eE][+-]?\d/.test(t.text(outId)), slug + ': no exponent notation');
    if (bigWant) eq(t.big(outId), bigWant, slug + ' longest headline');
    if (extra) extra(t);
  };
  big('cd-calculator', 'cd-out', { 'cd-deposit': '1e12', 'cd-apy': '0', 'cd-years': '100' }, '$1,000,000,000,000.00');
  big('cd-calculator', 'cd-out', { 'cd-deposit': '999999999999.99', 'cd-apy': '0', 'cd-years': '1' }, '$999,999,999,999.99', t => eq(t.kv('cd-out', 'Total interest earned'), '$0.00'));
  big('inflation-calculator', 'if-out', { 'if-amount': '1e12', 'if-years': '1', 'if-rate': '0' }, '$1,000,000,000,000');
  big('savings-goal-calculator', 'sg-out', { 'sg-goal': '1e12', 'sg-current': '0', 'sg-years': '60', 'sg-apy': '0' }, '$1,388,888,888.89');
  big('emergency-fund-calculator', 'ef-out', { 'ef-exp': '1e9', 'ef-months': '120', 'ef-current': '0', 'ef-contrib': '1e9' }, '$120,000,000,000',
    t => eq(t.kv('ef-out', 'Time to reach goal'), '10 yrs 0 mo at $1,000,000,000/mo'));
  big('loan-to-value-calculator', 'ltv-out', { 'ltv-loan': '9999999999.99', 'ltv-value': '1e10' }, '100.00%', t => eq(t.kv('ltv-out', 'Property value'), '$10,000,000,000'));
  big('debt-to-income-calculator', 'd-out', { 'd-income': '1e9', 'd-housing': '1e9', 'd-car': '1e9', 'd-cards': '1e9', 'd-student': '1e9', 'd-other': '1e9' }, '500.00%',
    t => eq(t.kv('d-out', 'Gross monthly income'), '$1,000,000,000'));
}

/* ================================== main ================================== */
const SUITES = {
  'cd-calculator': cd, 'inflation-calculator': inflation, 'savings-goal-calculator': savingsGoal,
  'emergency-fund-calculator': emergencyFund, 'loan-to-value-calculator': loanToValue, 'debt-to-income-calculator': debtToIncome, extremes, markup
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
