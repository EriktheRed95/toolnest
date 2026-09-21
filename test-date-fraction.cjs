// Runs the real inline scripts of tools/date-difference-calculator.html and
// tools/fraction-calculator.html against a minimal DOM, then re-runs the date
// suite in several time zones (including DST and half-hour-offset zones).
//   node test-date-fraction.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const ROOT = process.env.DF_ROOT || __dirname;   // DF_ROOT lets the suite be pointed at another copy of tools/

/* ---------- DOM harness: run the actual tool script, then edit fields live ---------- */
const cache = {};
function load(slug) {
  if (!cache[slug]) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', slug + '.html'), 'utf8');
    const code = src.match(/<script>([\s\S]*?)<\/script>/)[1];
    cache[slug] = { src, script: new vm.Script(code, { filename: slug + '.js' }) };
  }
  return cache[slug];
}
function buildNodes(src) {
  const nodes = {};
  for (const m of src.matchAll(/<(input|select|textarea|div|p|span)\b([^>]*)>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (!attrs.id) continue;
    const node = {
      id: attrs.id, value: attrs.value || '', innerHTML: '', style: {}, listeners: [],
      addEventListener(type, fn) { this.listeners.push(fn); }
    };
    if (m[1] === 'select') {
      const body = src.slice(m.index).split('</select>')[0];
      const sel = body.match(/<option value="([^"]*)"[^>]*selected/) || body.match(/<option value="([^"]*)"/);
      node.value = sel ? sel[1] : '';
    }
    nodes[attrs.id] = node;
  }
  return nodes;
}
function run(slug, overrides) {
  const { src, script } = load(slug);
  const nodes = buildNodes(src);
  const document = {
    getElementById(id) { if (!(id in nodes)) throw new Error('missing #' + id); return nodes[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  script.runInNewContext({ document });               // load: defaults + first render
  if (overrides && Object.keys(overrides).length) {   // then behave like a user typing
    for (const [id, val] of Object.entries(overrides)) document.getElementById(id).value = String(val);
    const fired = new Set();
    for (const node of Object.values(nodes)) for (const fn of node.listeners) if (!fired.has(fn)) { fired.add(fn); fn(); }
  }
  const outId = Object.keys(nodes).find(id => id.endsWith('-out'));
  return { out: nodes[outId].innerHTML, nodes };
}
let checks = 0;
function ok(cond, msg) { checks++; assert.ok(cond, msg); }
function eq(a, b, msg) { checks++; assert.strictEqual(a, b, msg); }
function clean(html, where) {
  ok(!/NaN|Infinity|undefined|null|e\+\d/.test(html), where + ': junk in output -> ' + html);
}

/* ================================ DATE TOOL ================================ */
const SLUG_D = 'date-difference-calculator';
function dd(startVal, endVal) {
  const { out } = run(SLUG_D, { 'dd-start': startVal, 'dd-end': endVal });
  if (/role="alert"/.test(out)) return { error: true, out };
  const b = /class="result-big">(-?\d+) yr (-?\d+) mo (-?\d+) d</.exec(out);
  const num = re => { const m = re.exec(out); return m ? Number(m[1].replace(/,/g, '')) : null; };
  ok(b, 'no breakdown in output -> ' + out);
  return {
    out, error: false,
    years: +b[1], months: +b[2], days: +b[3],
    totalDays: num(/Total days<\/span><span class="v">([\d,-]+) days/),
    weeks: num(/Total weeks<\/span><span class="v">([\d,-]+) weeks/),
    remDays: num(/Total weeks<\/span><span class="v">[\d,-]+ weeks ([\d-]+) day/),
    hours: num(/Total hours[^<]*<\/span><span class="v">([\d,-]+) hours/),
    minutes: num(/Total minutes[^<]*<\/span><span class="v">([\d,-]+) minutes/),
    anniversary: (/Last month anniversary<\/span><span class="v">([\d-]+) \+ (\d+) day/.exec(out) || [])[1],
    swapped: /were swapped/.test(out)
  };
}
// Independent reference: Howard Hinnant's days_from_civil.
function dayNum(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const dim = (y, m) => m === 2 ? (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28)
  : (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
const p2 = n => String(n).padStart(2, '0'), p4 = n => String(n).padStart(4, '0');
const isoOf = (y, m, d) => p4(y) + '-' + p2(m) + '-' + p2(d);
// Independent reference for the clamped-anniversary convention.
function refBreakdown(a, b) {
  const addClamped = n => {
    const t = a.y * 12 + (a.m - 1) + n, y = Math.floor(t / 12), m = t - y * 12 + 1;
    return { y, m, d: Math.min(a.d, dim(y, m)) };
  };
  let n = (b.y - a.y) * 12 + (b.m - a.m), anv = addClamped(n);
  if (dayNum(anv.y, anv.m, anv.d) > dayNum(b.y, b.m, b.d)) { n--; anv = addClamped(n); }
  return { years: Math.floor(n / 12), months: n - Math.floor(n / 12) * 12, days: dayNum(b.y, b.m, b.d) - dayNum(anv.y, anv.m, anv.d), anv };
}
const parseIso = s => ({ y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) });

function dateSuite(label) {
  // --- the historic bugs -------------------------------------------------
  let r = dd('2025-01-31', '2025-03-01');           // month borrowing used to go negative
  eq([r.years, r.months, r.days].join('/'), '0/1/1', label + ' Jan31->Mar1 breakdown');
  eq(r.totalDays, 29, label + ' Jan31->Mar1 days');
  eq(r.anniversary, '2025-02-28', label + ' Jan31->Mar1 clamped anniversary');
  r = dd('2024-01-31', '2024-03-01');               // same, leap year
  eq([r.years, r.months, r.days].join('/'), '0/1/1', label + ' leap Jan31->Mar1');
  eq(r.anniversary, '2024-02-29', label + ' leap clamp lands on Feb 29');
  eq(r.totalDays, 30, label + ' leap Jan31->Mar1 days');
  r = dd('2025-03-08', '2025-03-10');               // US spring forward: floor() used to give 1
  eq(r.totalDays, 2, label + ' DST spring-forward day count');
  eq(r.hours, 48, label + ' DST spring-forward nominal hours');
  eq(r.minutes, 2880, label + ' DST spring-forward nominal minutes');

  // --- DST boundaries in several regimes ---------------------------------
  for (const [s, e, days] of [
    ['2025-03-09', '2025-03-09', 0], ['2025-03-08', '2025-03-09', 1], ['2025-03-09', '2025-03-10', 1],
    ['2025-11-01', '2025-11-03', 2], ['2025-11-02', '2025-11-03', 1],   // US fall back
    ['2025-03-29', '2025-03-31', 2], ['2025-10-25', '2025-10-27', 2],   // EU
    ['2025-10-04', '2025-10-06', 2], ['2025-04-05', '2025-04-07', 2],   // Lord Howe (30 min)
    ['2025-09-27', '2025-09-29', 2], ['2025-04-05', '2025-04-06', 1],   // Chatham (45 min offset)
    ['2018-11-03', '2018-11-05', 2]                                     // Sao Paulo last DST
  ]) eq(dd(s, e).totalDays, days, label + ' DST span ' + s + '..' + e);

  // --- leap years ---------------------------------------------------------
  eq(dd('2024-02-28', '2024-03-01').totalDays, 2, label + ' leap Feb 28->Mar 1');
  eq(dd('2023-02-28', '2023-03-01').totalDays, 1, label + ' non-leap Feb 28->Mar 1');
  eq(dd('2024-01-01', '2025-01-01').totalDays, 366, label + ' 2024 length');
  eq(dd('2023-01-01', '2024-01-01').totalDays, 365, label + ' 2023 length');
  eq(dd('1900-01-01', '1901-01-01').totalDays, 365, label + ' 1900 is not a leap year');
  eq(dd('2000-01-01', '2001-01-01').totalDays, 366, label + ' 2000 is a leap year');
  r = dd('2024-02-29', '2025-02-28');
  eq([r.years, r.months, r.days].join('/'), '1/0/0', label + ' Feb29 -> Feb28 next year');
  r = dd('2024-02-29', '2025-03-01');
  eq([r.years, r.months, r.days].join('/'), '1/0/1', label + ' Feb29 -> Mar1 next year');
  eq(r.totalDays, 366, label + ' Feb29 -> Mar1 total days');
  r = dd('2025-03-31', '2025-04-30');
  eq([r.years, r.months, r.days].join('/'), '0/1/0', label + ' Mar31 -> Apr30 clamps to a whole month');

  // --- equal, reversed, week split ---------------------------------------
  r = dd('2025-06-15', '2025-06-15');
  eq([r.years, r.months, r.days, r.totalDays, r.weeks, r.remDays].join('/'), '0/0/0/0/0/0', label + ' equal dates');
  eq(r.swapped, false, label + ' equal dates are not reported as swapped');
  const fwd = dd('2025-01-31', '2025-03-01'), rev = dd('2025-03-01', '2025-01-31');
  eq(rev.swapped, true, label + ' reversed input reports the swap');
  eq(fwd.swapped, false, label + ' forward input does not report a swap');
  for (const k of ['years', 'months', 'days', 'totalDays', 'hours', 'minutes', 'anniversary'])
    eq(rev[k], fwd[k], label + ' reversed matches forward for ' + k);
  r = dd('2025-01-01', '2025-01-17');
  eq([r.weeks, r.remDays].join('/'), '2/2', label + ' week split');

  // --- validation ---------------------------------------------------------
  for (const bad of ['', '   ', '2025-02-30', '2025-13-01', '2025-00-10', '2025-01-00', '2023-02-29',
    '2025-1-1', '20250101', '2025/01/01', 'abc', 'Infinity', '2025-01-01T00:00:00', '+2025-01-01', '99999-01-01'])
    ok(dd(bad, '2025-01-01').error && dd('2025-01-01', bad).error, label + ' rejects ' + JSON.stringify(bad));
  ok(!dd('2024-02-29', '2024-03-01').error, label + ' accepts a real Feb 29');

  // --- year range, no 1900 offset bug ------------------------------------
  eq(dd('0001-01-01', '0001-12-31').totalDays, 364, label + ' year 1 is handled as year 1');
  eq(dd('0001-01-01', '9999-12-31').totalDays, dayNum(9999, 12, 31) - dayNum(1, 1, 1), label + ' full supported range');
  eq(dd('0004-02-28', '0004-03-01').totalDays, 2, label + ' year 4 is a leap year');

  // --- defaults are local "today", and a fresh load renders --------------
  const fresh = run(SLUG_D, {});
  const now = new Date(), todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  eq(fresh.nodes['dd-start'].value, todayIso, label + ' start defaults to local today');
  eq(fresh.nodes['dd-end'].value, todayIso, label + ' end defaults to local today');
  ok(/0 yr 0 mo 0 d/.test(fresh.out), label + ' default render is a zero span');
  clean(fresh.out, label + ' default render');

  // --- sweep: invariants + reference agreement ---------------------------
  const sweep = [];
  for (let d = 0; d < 400; d++) {                       // every day of a leap year vs fixed ends
    const date = new Date(Date.UTC(2024, 0, 1 + d));
    sweep.push([isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()), '2025-05-15']);
    sweep.push(['2024-01-31', isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())]);
  }
  for (const [s, e] of sweep) {
    const g = dd(s, e);
    ok(!g.error, label + ' sweep rejected ' + s + '..' + e);
    clean(g.out, label + ' sweep ' + s + '..' + e);
    const A = parseIso(s), B = parseIso(e);
    const lo = dayNum(A.y, A.m, A.d) <= dayNum(B.y, B.m, B.d) ? A : B;
    const hi = lo === A ? B : A;
    const ref = refBreakdown(lo, hi);
    eq(g.totalDays, dayNum(hi.y, hi.m, hi.d) - dayNum(lo.y, lo.m, lo.d), label + ' sweep days ' + s + '..' + e);
    eq([g.years, g.months, g.days].join('/'), [ref.years, ref.months, ref.days].join('/'), label + ' sweep breakdown ' + s + '..' + e);
    ok(g.years >= 0 && g.months >= 0 && g.months < 12 && g.days >= 0 && g.days < 31, label + ' sweep sane breakdown ' + s + '..' + e);
    eq(g.hours, g.totalDays * 24, label + ' sweep nominal hours ' + s + '..' + e);
    eq(g.minutes, g.totalDays * 1440, label + ' sweep nominal minutes ' + s + '..' + e);
    eq(g.weeks * 7 + g.remDays, g.totalDays, label + ' sweep week split ' + s + '..' + e);
  }
}

/* ============================== FRACTION TOOL ============================== */
const SLUG_F = 'fraction-calculator';
function fr(an, ad, bn, bd, op) {
  const { out } = run(SLUG_F, { 'fr-an': an, 'fr-ad': ad, 'fr-bn': bn, 'fr-bd': bd, 'fr-op': op });
  if (/role="alert"/.test(out)) return { error: true, out, msg: out.replace(/<[^>]*>/g, '') };
  const big = /class="result-big">([^<]+)</.exec(out);
  const dec = /Decimal<\/span><span class="v">([^<]+)</.exec(out);
  const mix = /Mixed number<\/span><span class="v">([^<]+)</.exec(out);
  ok(big && dec, 'fraction output incomplete -> ' + out);
  return {
    out, error: false, simplified: big[1].trim(),
    decimal: dec[1].replace('≈', '').trim(), approx: dec[1].includes('≈'),
    mixed: mix ? mix[1].trim() : null
  };
}
const babs = x => x < 0n ? -x : x;
function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function refFraction(an, ad, bn, bd, op) {
  let n, d;
  if (op === 'add') { n = an * bd + bn * ad; d = ad * bd; }
  else if (op === 'sub') { n = an * bd - bn * ad; d = ad * bd; }
  else if (op === 'mul') { n = an * bn; d = ad * bd; }
  else { n = an * bd; d = ad * bn; }
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const g = bgcd(n, d);
  return { n: n / g, d: d / g };
}
const OPS = ['add', 'sub', 'mul', 'div'];

function fractionSuite() {
  // --- defaults and the four operations ----------------------------------
  const def = run(SLUG_F, {});
  ok(/class="result-big">3\/4</.test(def.out), 'default 1/2 + 1/4 = 3/4');
  ok(/Decimal<\/span><span class="v">0\.75</.test(def.out), 'default decimal is exact 0.75');
  clean(def.out, 'default fraction render');
  eq(fr(1, 2, 1, 4, 'sub').simplified, '1/4', '1/2 - 1/4');
  eq(fr(1, 2, 1, 4, 'mul').simplified, '1/8', '1/2 x 1/4');
  eq(fr(1, 2, 1, 4, 'div').simplified, '2', '1/2 / 1/4');
  eq(fr(2, 4, 0, 1, 'add').simplified, '1/2', '2/4 simplifies');
  eq(fr(6, 8, 0, 1, 'add').simplified, '3/4', '6/8 simplifies');

  // --- signs --------------------------------------------------------------
  eq(fr(-1, 2, 1, 4, 'add').simplified, '-1/4', 'negative numerator');
  eq(fr(1, -2, 0, 1, 'add').simplified, '-1/2', 'negative denominator moves to the numerator');
  eq(fr(1, -2, -1, 4, 'mul').simplified, '1/8', 'two negatives multiply positive');
  eq(fr(-1, -2, 0, 1, 'add').simplified, '1/2', 'sign cancels');
  eq(fr(1, 2, -1, 4, 'div').simplified, '-2', 'negative divisor');
  eq(fr(-5, 4, 0, 1, 'add').mixed, '-1 1/4', 'negative mixed number');
  eq(fr(5, 4, 0, 1, 'add').mixed, '1 1/4', 'positive mixed number');
  eq(fr(1, 2, 0, 1, 'add').mixed, null, 'proper fraction has no mixed form');
  eq(fr(4, 2, 0, 1, 'add').mixed, null, 'whole number has no mixed form');
  eq(fr(4, 2, 0, 1, 'add').simplified, '2', 'whole number result');

  // --- zeros --------------------------------------------------------------
  for (const [an, ad, bn, bd, op] of [[0, 5, 0, 7, 'add'], [0, 5, 3, 4, 'mul'], [0, 5, 0, 7, 'sub'], [0, 5, 3, 4, 'div'], [3, 4, 3, 4, 'sub']]) {
    const g = fr(an, ad, bn, bd, op);
    eq(g.simplified, '0', 'zero result ' + [an, ad, bn, bd, op]);
    eq(g.decimal, '0', 'zero decimal ' + [an, ad, bn, bd, op]);
    eq(g.approx, false, 'zero is exact ' + [an, ad, bn, bd, op]);
  }
  ok(fr(3, 4, 0, 5, 'div').error, 'divide by a zero fraction is refused');
  ok(/divide by zero/.test(fr(3, 4, 0, 5, 'div').msg), 'divide-by-zero message');
  for (const op of OPS) {
    ok(fr(1, 0, 1, 4, op).error, 'zero denominator A refused (' + op + ')');
    ok(fr(1, 2, 1, 0, op).error, 'zero denominator B refused (' + op + ')');
    ok(/denominator/.test(fr(1, 0, 1, 4, op).msg), 'zero denominator message (' + op + ')');
    ok(!fr(0, 5, 1, 4, op).error || op === 'x', 'zero numerator A is fine (' + op + ')');
  }

  // --- invalid / incomplete input (never coerced to 0) --------------------
  const bad = ['', ' ', '.', '-', '+', '1.5', '-0.5', '1e3', '1E3', 'abc', 'NaN', 'Infinity', '-Infinity',
    '0x10', '1 000', '1,000', '2/3', '1.0', '1_0', '١٢'];
  for (const b of bad) {
    for (const [i, id] of ['fr-an', 'fr-ad', 'fr-bn', 'fr-bd'].entries()) {
      const vals = ['3', '4', '5', '6'];
      vals[i] = b;
      const g = fr(vals[0], vals[1], vals[2], vals[3], 'add');
      ok(g.error, 'rejects ' + JSON.stringify(b) + ' in ' + id);
      clean(g.out, 'invalid input render');
    }
  }
  eq(fr('007', '2', '-000', '4', 'add').simplified, '7/2', 'leading zeros accepted');
  eq(fr(' 3 ', '4', '1', '4', 'add').simplified, '1', 'surrounding spaces accepted');

  // --- size limits --------------------------------------------------------
  ok(!fr('999999999999999', 1, 1, 1, 'add').error, '15 digits accepted');
  for (const big of ['1000000000000000', '-1000000000000000', '99999999999999999999'])
    ok(/15 digits/.test(fr(big, 1, 1, 1, 'add').msg || ''), '16+ digits refused: ' + big);

  // --- large cross products stay exact ------------------------------------
  const A = 999999999999999n, B = 999999999999998n, C = 999999999999997n, D = 999999999999996n;
  for (const op of OPS) {
    const g = fr(A, B, C, D, op), ref = refFraction(A, B, C, D, op);
    eq(g.simplified, ref.d === 1n ? String(ref.n) : ref.n + '/' + ref.d, 'exact large ' + op);
    clean(g.out, 'large ' + op);
  }
  // a product a double would round: 999999999999999^2 = 999999999999998000000000000001
  eq(fr(A, 1, A, 1, 'mul').simplified, String(A * A), 'exact 30-digit product');
  ok(String(A * A) !== String(Number(A) * Number(A)), 'the exact product is beyond double precision');

  // --- decimals: exact vs honestly approximate ----------------------------
  eq(fr(1, 3, 0, 1, 'add').approx, true, '1/3 is flagged approximate');
  ok(/^0\.3{10,}/.test(fr(1, 3, 0, 1, 'add').decimal), '1/3 shows repeating digits');
  eq(fr(1, 8, 0, 1, 'add').decimal, '0.125', '1/8 exact');
  eq(fr(1, 8, 0, 1, 'add').approx, false, '1/8 not flagged approximate');
  eq(fr(-1, 3, 0, 1, 'add').decimal.charAt(0), '-', 'negative approximate decimal keeps its sign');
  ok(/rounded/.test(fr(1, 3, 0, 1, 'add').out), 'approximate results carry a note');
  ok(!/rounded/.test(fr(1, 8, 0, 1, 'add').out), 'exact results carry no rounding note');
  // very small magnitude must not collapse to "0"
  const tiny = fr(1, '999999999999999', 1, '999999999999999', 'mul');
  ok(tiny.decimal !== '0' && /^0\.0+[1-9]/.test(tiny.decimal), 'tiny value keeps significant digits -> ' + tiny.decimal);

  // --- exhaustive-ish: all ops, all sign combinations ---------------------
  const VALS = [-7n, -3n, -1n, 0n, 1n, 2n, 6n, 12n];
  let cases = 0;
  for (const an of VALS) for (const ad of VALS) for (const bn of VALS) for (const bd of VALS) for (const op of OPS) {
    const g = fr(an, ad, bn, bd, op);
    if (ad === 0n || bd === 0n || (op === 'div' && bn === 0n)) { ok(g.error, 'must refuse ' + [an, ad, bn, bd, op]); continue; }
    ok(!g.error, 'unexpected refusal ' + [an, ad, bn, bd, op] + ' -> ' + g.msg);
    cases++;
    const ref = refFraction(an, ad, bn, bd, op);
    eq(g.simplified, ref.d === 1n ? String(ref.n) : ref.n + '/' + ref.d, 'value ' + [an, ad, bn, bd, op]);
    clean(g.out, 'combo ' + [an, ad, bn, bd, op]);
    // mixed number shown exactly when improper, and consistent with the fraction
    if (ref.d !== 1n && babs(ref.n) > ref.d) {
      eq(g.mixed, String(ref.n / ref.d) + ' ' + String(babs(ref.n % ref.d)) + '/' + String(ref.d), 'mixed ' + [an, ad, bn, bd, op]);
    } else eq(g.mixed, null, 'no mixed form ' + [an, ad, bn, bd, op]);
    // decimal: exact claim must hold, approximations within half an ulp and 1e-10 relative
    const dm = /^(-?)(\d+)(?:\.(\d+))?$/.exec(g.decimal);
    ok(dm, 'decimal shape ' + g.decimal);
    const scale = 10n ** BigInt(dm[3] ? dm[3].length : 0);
    const shown = (dm[1] ? -1n : 1n) * BigInt(dm[2] + (dm[3] || ''));
    const err = babs(shown * ref.d - ref.n * scale);
    if (!g.approx) eq(err, 0n, 'claimed-exact decimal is exact ' + [an, ad, bn, bd, op] + ' ' + g.decimal);
    else {
      ok(2n * err <= ref.d, 'rounded within half an ulp ' + [an, ad, bn, bd, op] + ' ' + g.decimal);
      ok(err * 10000000000n <= babs(ref.n) * scale, 'rounded to >=10 significant digits ' + [an, ad, bn, bd, op]);
    }
  }
  ok(cases > 1500, 'combination sweep ran (' + cases + ' cases)');
}

/* ================================== main ================================== */
const ZONES = ['UTC', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe', 'Pacific/Chatham',
  'Asia/Kolkata', 'Pacific/Kiritimati', 'America/Sao_Paulo', 'Pacific/Honolulu'];
if (process.env.DF_TZ_CHILD) {
  dateSuite('TZ=' + process.env.TZ);
  console.log('  PASS date suite in TZ=' + process.env.TZ + ' (' + checks + ' checks)');
} else {
  const t0 = Date.now();
  dateSuite('local');
  console.log('PASS date-difference-calculator: clamped anniversaries, UTC date-only totals, validation, sweep (' + checks + ' checks)');
  const afterDate = checks;
  fractionSuite();
  console.log('PASS fraction-calculator: exact BigInt arithmetic, signs, zeros, validation, limits, decimals (' + (checks - afterDate) + ' checks)');
  for (const tz of ZONES) {
    execFileSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, DF_TZ_CHILD: '1' }, stdio: 'inherit' });
  }
  console.log('PASS all suites in ' + ZONES.length + ' time zones including DST and 30/45-minute offsets (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
}
