// drowninginsymbols: reading input, working out context, and drawing the page.
// Plain script (no modules) so the site runs straight from disk. data.js must load first.
'use strict';

/* ---------------- storage: fails soft (private mode, blocked storage) ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('dis.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dis.' + k, JSON.stringify(v)); } catch { /* keep working without saving */ } }
};
const profile = () => store.get('profile', { cur: 'any', level: 'school' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);

/* ---------------- text -> tokens ---------------- */
const NAMES = {
  alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'θ', Theta: 'Θ', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', Phi: 'Φ',
  chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω', hbar: 'ℏ', nabla: '∇', partial: '∂', propto: '∝',
  infty: '∞', sqrt: '√', ell: 'ℓ', cdot: '·', times: '×', approx: '≈'
};
const VARIANTS = { 'ϕ': 'φ', 'ϵ': 'ε', 'ϑ': 'θ', 'ϱ': 'ρ', 'ħ': 'ℏ', 'µ': 'μ', 'Ω': 'Ω', '’': '′', "'": '′', '−': '-', '–': '-', '½': '1/2', '⋅': '·' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const wrap = x => x.length > 1 ? '{' + x + '}' : x;

// Turns what people type (Greek names, \rho, v₀, x², ϕ) into the one syntax the data uses.
function normalize(raw) {
  let s = String(raw).trim();
  const notes = [];
  if (NAMES[s]) return { s: NAMES[s], notes: [`“${s}” is the Greek letter ${NAMES[s]}.`] };
  s = s.replace(/\\mathcal\{E\}/g, 'ℰ').replace(/\\([A-Za-z]+)/g, (m, n) => NAMES[n] ?? m);
  s = s.replace(/[ϕϵϑϱħµΩ’'−–½⋅]/g, c => {
    if ('ϕϵϑϱ'.includes(c)) notes.push(`${c} and ${VARIANTS[c]} are the same letter in a different font.`);
    return VARIANTS[c];
  });
  s = s.replace(/[₀-₉ₐₑₒₓₕ-ₜ]+/g, m => '_' + wrap([...m].map(c => SUB[c]).join('')));
  s = s.replace(/[⁰¹²³⁴-⁹⁻⁺]+/g, m => '^' + wrap([...m].map(c => SUP[c]).join('')));
  return { s, notes };
}

const LETTER = /[A-Za-zα-ωΑ-Ωđℏℓℰ∂∇]/;
const FN = /^(?:arcsin|arccos|arctan|sin|cos|tan|tg|cotg|cot|lg|ln|log|exp)(?![A-Za-z])/;
let DICT = null; // multi-character spellings -> canonical symbol, longest first
function dict() {
  if (DICT) return DICT;
  const map = new Map();
  for (const m of DB.meanings) {
    if (m.kind === 'unit') continue; // units only count after a number, see parse()
    for (const k of [m.sym, ...(m.alias || [])]) if ([...k].length > 1 && !FN.test(k)) map.set(k, m.sym);
  }
  return (DICT = [...map].sort((a, b) => b[0].length - a[0].length));
}

// One letter (+ subscript + primes) is one symbol, so "pV" is p and V. Known multi-letter
// symbols (KE, Wđ, v0...) come from the data.
function tokenize(s) {
  const out = [];
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    let m;
    if (/\s/.test(s[i])) { i++; continue; }
    if ((m = rest.match(/^\d+(?:[.,]\d+)?/))) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if ((m = rest.match(FN))) { out.push({ t: 'fn', v: m[0] }); i += m[0].length; continue; }
    const d = dict().find(([k]) => rest.startsWith(k));
    if (d) { out.push({ t: 'sym', v: d[1] }); i += d[0].length; continue; }
    if (LETTER.test(s[i])) {
      m = rest.match(/^(.)(?:_(?:\{([^}]*)\}|([^\s{}])))?(′*)/);
      const sub = m[2] ?? m[3] ?? '';
      out.push({ t: 'sym', v: m[1] + (sub ? '_' + wrap(sub) : '') + m[4] });
      i += m[0].length; continue;
    }
    out.push({ t: 'op', v: s[i] }); i++;
  }
  return out;
}
const symsOf = s => [...new Set(tokenize(normalize(s).s).filter(k => k.t === 'sym').map(k => k.v))];

/* ---------------- tokens -> HTML ---------------- */
function symHTML(v) {
  const m = v.match(/^(.+?)(?:_\{?(.*?)\}?)?(′*)$/);
  const cls = /^[A-Za-zα-ωđℓ]+$/.test(m[1]) ? 'v' : 'vu';
  return `<span class="${cls}">${esc(m[1])}</span>${m[2] ? `<sub>${esc(m[2])}</sub>` : ''}${m[3]}`;
}
// Spaced with CSS margins, not spaces: an italic E swallows a plain space ("E= hf").
const OPS = { '=': '<span class="op">=</span>', '+': '<span class="op">+</span>', '-': '<span class="op">−</span>', '*': '·', '·': '·', '≈': '<span class="op">≈</span>', '∝': '<span class="op">∝</span>', '{': '', '}': '' };
function toHTML(toks) {
  let h = '';
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === 'op' && k.v === '^') { // superscript: a {group}, or one token (with its minus sign)
      let j = i + 1;
      const grp = [];
      if (toks[j]?.v === '{') {
        for (let depth = 0, j2 = j + 1; j2 < toks.length; j2++) {
          j = j2;
          if (toks[j2].v === '}' && depth === 0) break;
          if (toks[j2].v === '{') depth++;
          if (toks[j2].v === '}') depth--;
          grp.push(toks[j2]);
        }
      } else {
        if (toks[j]?.v === '-') grp.push(toks[j++]);
        if (toks[j]) grp.push(toks[j]);
      }
      h += `<sup>${toHTML(grp)}</sup>`;
      i = j;
      continue;
    }
    h += k.t === 'sym' ? symHTML(k.v) : k.t === 'fn' ? `<span class="fn">${k.v} </span>` : k.t === 'num' ? k.v : (OPS[k.v] ?? esc(k.v));
  }
  return h;
}
const render = s => toHTML(tokenize(normalize(s).s));

/* ---------------- understanding a question ---------------- */
const normUnit = u => normalize(u).s.replace(/[\s{}]/g, '').replace(/[·*×]/g, '.');
let UNITS = null;
const knownUnit = u => (UNITS ??= new Set(DB.meanings.flatMap(m =>
  [...(m.units || []), ...(m.kind === 'unit' ? [m.sym, ...(m.alias || [])] : [])]).map(normUnit))).has(normUnit(u));
const NUM = String.raw`-?\d+(?:[.,]\d+)?(?:\s*[×x*·]\s*10\^\{?-?\d+\}?)?`;

function matchFormula(syms) {
  if (syms.length < 2) return null;
  let best = null;
  for (const f of DB.formulas) {
    const vs = Object.keys(f.vars);
    const score = syms.filter(x => vs.includes(x)).length / new Set([...vs, ...syms]).size;
    if (score >= 0.6 && (!best || score > best.score)) best = { f, score };
  }
  return best && best.f;
}

// Works out what the user typed: one symbol, "Q = 5 C", "60 W", or a formula.
function parse(raw) {
  const { s, notes } = normalize(raw);
  const p = { raw, s, notes, unit: '', unitOnly: false, lhs: '', num: '', whole: null };
  const exact = DB.meanings.find(m => m.sym === s || (m.alias || []).includes(s));
  let m;
  if (exact) p.whole = exact.sym;
  else if ((m = s.match(new RegExp(`^(${NUM})\\s*(\\S.*)$`))) && knownUnit(m[2])) Object.assign(p, { unitOnly: true, num: m[1], unit: m[2] });
  else if ((m = s.match(new RegExp(`^([^=]+?)\\s*=\\s*(${NUM})\\s*(\\S.*)$`))) && knownUnit(m[3]) && symsOf(m[1]).length === 1) Object.assign(p, { lhs: m[1], num: m[2], unit: m[3] });
  p.toks = tokenize(p.lhs || s);
  p.syms = p.whole ? [p.whole] : p.unitOnly ? [] : [...new Set(p.toks.filter(k => k.t === 'sym').map(k => k.v))];
  p.formula = matchFormula(p.syms);
  return p;
}

// Everything that can hint at the topic: the other symbols, a unit, pasted words, the profile.
function context(p, o = {}) {
  const extra = o.pasted ? normalize(o.pasted).s : '';
  // ponytail: a pasted sentence is mostly English words; only short or math-looking chunks are read as symbols.
  const mathy = extra.split(/\s+/).filter(w => /[=_^α-ωΑ-Ω]/.test(w) || [...w.replace(/[.,;:()]/g, '')].length <= 2).join(' ');
  const syms = [...new Set([...p.syms, ...symsOf(mathy)])];
  return {
    syms, unit: p.unit, unitOnly: p.unitOnly, text: (p.s + ' ' + extra).toLowerCase(), topic: o.topic || null,
    formula: p.formula || matchFormula(symsOf(mathy)), profile: o.profile || profile()
  };
}

// Whole words only: "moment" must not match inside "momentum". \p{L} covers Vietnamese letters.
const hasWord = (text, w) => new RegExp(`(?<!\\p{L})${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'u').test(text);

// Scores every meaning of `sym` against the context. Highest first, each with its reasons.
function rank(sym, ctx) {
  const P = ctx.profile;
  return DB.meanings.filter(m => m.sym === sym).map(m => {
    let score = m.common || 0;
    const why = [];
    if (ctx.unit) {
      if ((m.units || []).some(u => normUnit(u) === normUnit(ctx.unit))) { score += 8; why.push(`the unit ${ctx.unit}`); }
      else score -= 2;
    }
    if (ctx.unitOnly) score += m.kind === 'unit' ? 10 : -10;
    if (ctx.formula && ctx.formula.vars[sym] === m.id) { score += 6; why.push(`of the formula ${ctx.formula.f} (${ctx.formula.name})`); }
    let best = null;
    for (const f of DB.formulas) {
      if (f.vars[sym] !== m.id || f === ctx.formula) continue;
      const hit = Object.keys(f.vars).filter(k => k !== sym && ctx.syms.includes(k));
      if (hit.length && (!best || hit.length > best.hit.length)) best = { f, hit };
    }
    if (best) { score += 2 * best.hit.length; why.push(`${best.hit.join(', ')} appear${best.hit.length > 1 ? '' : 's'} with it in the ${best.f.name}`); }
    const words = (m.words || []).filter(w => hasWord(ctx.text, w));
    if (words.length) { score += 3 * words.length; why.push(`the words “${words.join('”, “')}”`); }
    if (!m.cur.includes('all') && P.cur !== 'any') {
      if (m.cur.includes(P.cur)) { score += 1; why.push('your textbooks'); } else score -= 3;
    }
    if (m.level === 'uni' && P.level === 'school') score -= 1;
    if (ctx.topic) score += m.topic === ctx.topic ? 20 : -20;
    return { m, score, why };
  }).sort((a, b) => b.score - a.score);
}
// Only worth asking for a topic when the close runners-up live in different topics.
const needsTopic = r => r.length > 1 && r[0].score - r[1].score < 3 && r[0].m.topic !== r[1].m.topic;

/* ======================================================================= */
/* ---------------- the page ---------------- */
const byId = id => DB.meanings.find(m => m.id === id);
const formulaById = id => DB.formulas.find(f => f.id === id);
const glyph = sym => DB.glyphs.find(g => g.g === sym.match(/^(.+?)(?:_|′|$)/)[1]);
const curTags = cur => cur.map(c => `<span class="tag">${esc(DB.cur[c] || c)}</span>`).join(' ');
const btn = (act, label, arg = '', cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}" data-arg="${esc(arg)}">${label}</button>`;
const step = (n, title, body) => `<section class="step"><h2><span class="n">${n}</span>${title}</h2>${body}</section>`;
const KIND = { quantity: 'Physical quantity', constant: 'Constant', unit: 'Unit', label: 'Label (a name, not a quantity)', operator: 'Maths notation' };

let S = {};
const blank = () => ({ p: null, target: null, confirmed: false, tries: 0, topic: null, askTopic: false, idk: false, pasted: '', pasteUsed: false, showAll: false, pick: null, fb: null, rounds: 0, end: null });

function ranked() {
  return rank(S.target.sym, context(S.p, { pasted: S.pasted, topic: S.topic }));
}
function log(outcome, what) {
  const h = store.get('history', []);
  h.unshift({ at: new Date().toISOString(), input: S.p.raw, what, outcome });
  store.set('history', h.slice(0, 200));
}
function answerName() {
  if (!S.target) return '';
  if (S.target.formula) return formulaById(S.target.formula).name;
  const r = ranked();
  return r.length ? (byId(S.pick) || r[0].m).name : '(not in database)';
}
function finish(outcome) {
  S.end = outcome;
  log(outcome, answerName());
}
function report(expected) {
  const q = store.get('queue', []);
  q.unshift({ at: new Date().toISOString(), input: S.p.raw, sym: S.target && S.target.sym || '', topic: S.topic || '', expected: expected || '' });
  store.set('queue', q.slice(0, 200));
}

function submit(raw) {
  if (S.p && S.confirmed && !S.end) log('abandoned', answerName());
  const tries = S.p && !S.confirmed ? S.tries : 0; // retyping after "No, let me fix it" is the same attempt
  S = { ...blank(), tries, p: parse(raw) };
  if (S.p.syms.length === 1) S.target = { sym: S.p.syms[0] };
  draw();
}

function stepRecognize() {
  const p = S.p;
  let h = '<p class="lbl">We read it as</p>';
  h += p.unit ? `<div class="read">${p.lhs ? render(p.lhs) + ' = ' : ''}${esc(p.num)} <span class="unit">${esc(p.unit)}</span></div>`
    : `<div class="read">${toHTML(p.toks) || esc(p.s)}</div>`;
  h += p.notes.map(n => `<p class="note">${esc(n)}</p>`).join('');
  if (p.unitOnly) {
    const users = DB.meanings.filter(m => m.kind !== 'unit' && (m.units || []).some(u => normUnit(u) === normUnit(p.unit)));
    const unitSym = DB.meanings.find(m => m.kind === 'unit' && normUnit(m.sym) === normUnit(p.unit));
    h += `<p>That is a number with a unit. <span class="unit">${esc(p.unit)}</span> is ${unitSym ? `the unit ${esc(unitSym.name)}` : 'a unit'}${users.length ? ', used to measure:' : '.'}</p>`;
    h += users.length ? `<p class="row">${users.map(m => btn('open', `${symHTML(m.sym)} ${esc(m.name)}`, m.id)).join('')}</p>` : '';
    return step('03', 'Recognize', h);
  }
  if (!p.syms.length) return step('03', 'Recognize', h + '<p>We could not find a symbol in that. Try one symbol, or a formula like pV = nRT.</p>');
  if (S.target && S.target.sym && p.syms.length === 1) {
    const g = glyph(S.target.sym);
    if (g) h += `<p><span class="math">${esc(g.g)}</span> is <b>${esc(g.name)}</b>, said “${esc(g.say)}”.</p>`;
    const look = g ? g.look.filter(x => DB.meanings.some(m => m.sym === x)) : [];
    if (look.length && !S.confirmed) h += `<p class="row">Or did you mean ${look.map(x => btn('swap', `<span class="math">${esc(x)}</span> ${esc((DB.glyphs.find(y => y.g === x) || {}).name || '')}`, x)).join('')}</p>`;
  } else if (!S.confirmed) {
    h += `<p class="lbl">Which symbol are you asking about?</p><p class="row">${p.syms.map(x => btn('sym', `<span class="math">${symHTML(x)}</span>`, x, 'chip')).join('')}</p>`;
    if (p.formula) h += `<p class="row">${btn('whole', `Explain the whole formula: ${esc(p.formula.name)}`, '', 'primary')}</p>`;
  }
  if (S.confirmed) {
    h += `<p class="done">✓ ${S.target.formula ? esc(formulaById(S.target.formula).name) : `<span class="math">${symHTML(S.target.sym)}</span>`}</p>`;
  } else {
    h += `<p class="lbl">Is this what you meant?</p><p class="row">${S.target ? btn('yes', 'Yes', '', 'primary') : ''}${btn('fix', 'No, let me fix it')}</p>`;
    if (S.tries >= 2) h += '<p>Still not right? <a href="#/table">Browse the symbol table</a>, or open “Describe the shape” above.</p>';
    else if (S.tries === 1) h += '<p class="note">Tip: use the symbol keyboard for Greek letters, “_” for a subscript (v_0) and “^” for a power (v^2).</p>';
  }
  return step('03', 'Recognize', h);
}

function stepContext() {
  if (S.target.formula) {
    const f = formulaById(S.target.formula);
    return step('04', 'Context', `<p>Topic: <b>${esc(DB.topics[f.topic])}</b>, from the formula itself.</p>`);
  }
  const r = ranked();
  if (!r.length) return step('04', 'Context', '<p>We have no meaning for this symbol yet, so there is nothing to choose between.</p>');
  if (r.length === 1) return step('04', 'Context', `<p>Only one meaning in our database, in <b>${esc(DB.topics[r[0].m.topic])}</b>.</p>`);
  if (S.showAll) return step('04', 'Context', '<p>Showing every meaning, grouped by topic.</p>');
  if (S.askTopic || (!S.topic && !S.pick && needsTopic(r))) {
    const topics = [...new Set(r.map(x => x.m.topic))];
    let h = `<p>This symbol means different things in different topics. Which are you studying?</p>
      <p class="row">${topics.map(t => btn('topic', esc(DB.topics[t]), t)).join('')}${btn('idk', 'I don’t know')}</p>`;
    if (S.idk) {
      h += S.pasteUsed ? '' : `<label class="lbl" for="paste">Paste the sentence or formula where you saw it (optional)</label>
        <textarea id="paste" rows="3" placeholder="e.g. The gas has pressure p and volume V…"></textarea>
        <p class="row">${btn('usepaste', 'Use it', '', 'primary')}${btn('showall', 'Skip: show every meaning')}</p>`;
      if (S.pasteUsed) h += `<p class="row">${btn('showall', 'Show every meaning')}</p>`;
    }
    return step('04', 'Context', h);
  }
  const top = S.pick ? r.find(x => x.m.id === S.pick) : r[0];
  const because = S.pick ? 'you picked it' : S.topic ? 'you picked the topic' : top.why.length ? top.why.join('; ') : 'it is the most common meaning';
  return step('04', 'Context', `<p>Looks like: <b>${esc(DB.topics[top.m.topic])}</b>, because ${esc(because)}.</p><p class="row">${btn('changetopic', 'Change topic')}</p>`);
}

function symbolCard(top, r) {
  const m = top.m, g = glyph(m.sym), P = profile();
  const uses = DB.formulas.filter(f => Object.values(f.vars).includes(m.id)).slice(0, 4);
  // p_1, p_2 are "pressure in state 1/2", not other ways to write pressure
  const base = s => s.split('_')[0];
  const same = DB.meanings.filter(x => x.q === m.q && base(x.sym) !== base(m.sym));
  const others = r.filter(x => x !== top);
  let h = `<p class="assumed">Assumed: ${esc(DB.topics[m.topic])} · ${esc(P.cur === 'any' ? 'any textbook' : DB.cur[P.cur])} ${btn('changetopic', 'Change')}</p>`;
  if (others.length && top.score - others[0].score < 3 && !S.pick) h += `<p class="note">Could also be: ${esc(others[0].m.name)} (see “Other meanings” below).</p>`;
  h += `<div class="big">${symHTML(m.sym)}</div>`;
  if (g) h += `<p class="muted">${esc(g.name)} · say “${esc(g.say)}”</p>`;
  h += `<h3>${esc(m.name)}</h3>${P.cur !== 'intl' && m.vi ? `<p class="muted">${esc(m.vi)}</p>` : ''}`;
  h += `<dl><dt>Kind</dt><dd>${KIND[m.kind]}${m.vector ? ' · vector (has a direction)' : ''}</dd>`;
  if (m.kind !== 'unit' && m.kind !== 'label' && m.kind !== 'operator') h += `<dt>SI unit</dt><dd>${m.unit ? `<span class="unit">${esc(m.unit)}</span>` : 'none (a pure number)'}</dd>`;
  if (m.value) h += `<dt>Value</dt><dd>${esc(m.value)}</dd>`;
  h += `<dt>Used in</dt><dd>${curTags(m.cur)}${m.level === 'uni' ? ' <span class="tag">University</span>' : ''}</dd></dl>`;
  h += `<p>${esc(m.note)}</p>`;
  if (m.kind === 'unit') h += '<p class="warn">This is a unit, not a quantity: it tells you what something is measured in.</p>';
  if (m.kind === 'label') h += '<p class="warn">This is a label (a name for a particle or object), not a quantity you calculate with.</p>';
  if (uses.length) h += `<h4>Where you will see it</h4><ul class="forms">${uses.map(f => `<li><span class="math">${render(f.f)}</span> <span class="muted">${esc(f.name)}</span></li>`).join('')}</ul>`;
  if (same.length) h += `<h4>Other symbols for ${esc(m.name.toLowerCase())}</h4><ul class="forms">${same.map(x => `<li><span class="math">${symHTML(x.sym)}</span> ${curTags(x.cur)}</li>`).join('')}</ul>`;
  if (others.length) h += `<h4>Other meanings of <span class="math">${symHTML(m.sym)}</span></h4><p class="row">${others.map(x => btn('pick', `${esc(x.m.name)} <span class="muted">· ${esc(DB.topics[x.m.topic])}</span>`, x.m.id)).join('')}</p>`;
  if (g && g.look.length) h += `<h4>Do not confuse with</h4><p class="row">${g.look.map(x => btn('swap', `<span class="math">${esc(x)}</span> ${esc((DB.glyphs.find(y => y.g === x) || { name: '' }).name)}`, x)).join('')}</p>`;
  if (g) h += `<h4>How to type it</h4><p><code>${esc(g.tex)}</code> in LaTeX, or copy <span class="math">${esc(g.g)}</span></p>`;
  return `<article class="card">${h}</article>`;
}

function formulaCard(f) {
  const P = profile();
  const forms = DB.formulas.filter(x => x.law === f.law && x.id !== f.id);
  let h = `<p class="assumed">Assumed: ${esc(DB.topics[f.topic])} · ${esc(P.cur === 'any' ? 'any textbook' : DB.cur[P.cur])}</p>`;
  h += `<div class="big formula">${render(f.f)}</div><h3>${esc(f.name)}</h3>${P.cur !== 'intl' && f.vi ? `<p class="muted">${esc(f.vi)}</p>` : ''}`;
  h += `<p>${curTags(f.cur)}</p><h4>Each symbol</h4><table>${Object.entries(f.vars).map(([k, id]) => {
    const m = byId(id) || { name: id, unit: '' };
    return `<tr><td class="math">${symHTML(k)}</td><td>${btn('open', esc(m.name), id, 'link')}</td><td class="unit">${esc(m.unit || '')}</td></tr>`;
  }).join('')}</table>`;
  if (f.when) h += `<h4>When it applies</h4><p>${esc(f.when)}</p>`;
  if (f.note) h += `<p class="warn">${esc(f.note)}</p>`;
  if (forms.length) h += `<h4>Other ways it is written</h4><ul class="forms">${forms.map(x => `<li><span class="math">${render(x.f)}</span> ${curTags(x.cur)}${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}</li>`).join('')}</ul>`;
  return `<article class="card">${h}</article>`;
}

function stepAnswer() {
  if (S.target.formula) return step('06', 'Answer', formulaCard(formulaById(S.target.formula)));
  const r = ranked();
  if (!r.length) {
    const sym = S.target.sym, swapped = sym === sym.toLowerCase() ? sym.toUpperCase() : sym.toLowerCase();
    const alt = [swapped, ...((glyph(sym) || { look: [] }).look)].filter(x => x !== sym && DB.meanings.some(m => m.sym === x));
    return step('05', 'Look up', `<p>Not in our database yet. We saved it so it can be added.</p>${alt.length ? `<p class="row">Did you mean ${alt.map(x => btn('swap', `<span class="math">${symHTML(x)}</span>`, x)).join('')}</p>` : ''}`);
  }
  if (S.showAll) {
    const topics = [...new Set(r.map(x => x.m.topic))];
    return step('06', 'Every meaning', topics.map(t => `<h4>${esc(DB.topics[t])}</h4><p class="row">${r.filter(x => x.m.topic === t).map(x => btn('pick', esc(x.m.name), x.m.id)).join('')}</p>`).join(''));
  }
  if (S.askTopic || (!S.topic && !S.pick && needsTopic(r))) return '';
  const top = (S.pick && r.find(x => x.m.id === S.pick)) || r[0];
  return step('05', 'Look up', `<p class="muted">${r.length} meaning${r.length > 1 ? 's' : ''} of <span class="math">${symHTML(S.target.sym)}</span> in the database.</p>`)
    + step('06', 'Answer', symbolCard(top, r));
}

function stepFeedback() {
  if (S.end) {
    return step('07', 'Done', `<p>Saved to your <a href="#/history">history</a> as <b>${S.end}</b>.</p><p class="row">${btn('new', 'New lookup', '', 'primary')}</p>`);
  }
  let h;
  if (S.fb === 'menu') {
    h = `<p class="lbl">What was wrong?</p><p class="row">${btn('wrongsym', 'Wrong symbol')}${S.target.sym ? btn('wrongtopic', 'Wrong topic') : ''}${btn('missing', 'My meaning isn’t listed')}</p>`;
  } else if (S.fb === 'missing') {
    h = `<label class="lbl" for="expected">What did you expect it to mean?</label><input id="expected" placeholder="e.g. power of a lens, in my optics class">
      <p class="row">${btn('send', 'Send', '', 'primary')}</p>`;
  } else {
    h = `<p class="lbl">Did this help?</p><p class="row">${btn('good', 'Yes', '', 'primary')}${btn('notquite', 'Not quite')}</p>`;
  }
  return step('07', 'Feedback', h);
}

function draw() {
  const el = $('#flow');
  if (!S.p) { el.innerHTML = ''; return; }
  let h = stepRecognize();
  if (S.confirmed && S.target) {
    h += stepContext();
    const ans = stepAnswer();
    h += ans;
    if (ans && !S.showAll && (S.target.formula || ranked().length || S.end)) h += stepFeedback();
  }
  el.innerHTML = h;
}

const act = {
  yes() {
    S.confirmed = true;
    if (!ranked().length) { report(); finish('unresolved'); }
  },
  fix() {
    S.tries++;
    S.confirmed = false;
    if (S.p.syms.length > 1) S.target = null;
    $('#q').focus();
    $('#q').select();
  },
  sym(x) { S.target = { sym: x }; S.confirmed = true; if (!ranked().length) { report(); finish('unresolved'); } },
  whole() { S.target = { formula: S.p.formula.id }; S.confirmed = true; },
  swap(x) { $('#q').value = x; submit(x); return 'drawn'; },
  open(id) {
    const m = byId(id);
    Object.assign(S, { target: { sym: m.sym }, confirmed: true, pick: id, topic: null, askTopic: false, showAll: false, fb: null });
  },
  topic(t) { Object.assign(S, { topic: t, askTopic: false, idk: false, pick: null, showAll: false }); },
  idk() { S.idk = true; },
  usepaste() { Object.assign(S, { pasted: $('#paste').value, pasteUsed: true, idk: false, askTopic: false }); },
  showall() { Object.assign(S, { showAll: true, idk: false, askTopic: false }); },
  pick(id) { Object.assign(S, { pick: id, showAll: false, askTopic: false, fb: null }); },
  changetopic() { Object.assign(S, { askTopic: true, pick: null, topic: null, showAll: false, fb: null }); },
  good() { finish('resolved'); },
  notquite() {
    S.rounds++;
    if (S.rounds > 2) finish('unresolved'); else S.fb = 'menu';
  },
  wrongsym() { S.fb = null; act.fix(); },
  wrongtopic() { S.fb = null; act.changetopic(); },
  missing() { S.fb = 'missing'; },
  send() { report(($('#expected') || {}).value); finish('unresolved'); },
  new() { S = blank(); $('#q').value = ''; $('#q').focus(); }
};

/* ---------------- other pages ---------------- */
const KEYS = 'α β γ δ Δ ε θ λ μ ν π ρ σ Σ τ φ Φ ψ ω Ω ℏ ∂ ∇ ∝ ≈ √ ′'.split(' ');
function drawKeys() {
  const name = g => (DB.glyphs.find(x => x.g === g) || { name: g === '′' ? 'prime' : g }).name;
  $('#keys').innerHTML = KEYS.map(k => `<button type="button" class="key" data-key="${k}" title="${esc(name(k))}"><span class="math">${k}</span><small>${esc(name(k))}</small></button>`).join('')
    + '<button type="button" class="key" data-key="_" title="subscript: v_0"><span class="math">x<sub>0</sub></span><small>subscript</small></button>'
    + '<button type="button" class="key" data-key="^" title="power: v^2"><span class="math">x<sup>2</sup></span><small>power</small></button>';
  $('#shapes').innerHTML = Object.entries(DB.shapes).filter(([k]) => DB.glyphs.some(g => g.shape === k))
    .map(([k, label]) => `<button type="button" class="btn" data-shape="${k}">${esc(label)}</button>`).join('') + '<div id="shape-hits" class="row"></div>';
}
function glyphChip(g) {
  return `<button type="button" class="glyph" data-go="${esc(g.g)}"><span class="math">${esc(g.g)}</span><b>${esc(g.name)}</b><small>say “${esc(g.say)}”</small></button>`;
}
function drawTable() {
  $('#table').innerHTML = Object.entries(DB.shapes).map(([k, label]) => {
    const gs = DB.glyphs.filter(g => g.shape === k);
    return gs.length ? `<h3>${esc(label)}</h3><div class="grid">${gs.map(glyphChip).join('')}</div>` : '';
  }).join('');
}
function drawHistory() {
  const h = store.get('history', []), q = store.get('queue', []);
  $('#hist').innerHTML = h.length
    ? `<table><tr><th>When</th><th>You asked</th><th>Answer</th><th>Outcome</th></tr>${h.map(x => `<tr><td class="muted">${esc(new Date(x.at).toLocaleString())}</td><td class="math">${esc(x.input)}</td><td>${esc(x.what)}</td><td><span class="tag">${esc(x.outcome)}</span></td></tr>`).join('')}</table>`
    : '<p class="muted">No lookups yet.</p>';
  $('#queue').innerHTML = q.length
    ? `<table><tr><th>When</th><th>Input</th><th>Topic</th><th>Expected</th></tr>${q.map(x => `<tr><td class="muted">${esc(new Date(x.at).toLocaleString())}</td><td class="math">${esc(x.input)}</td><td>${esc(DB.topics[x.topic] || '')}</td><td>${esc(x.expected)}</td></tr>`).join('')}</table>`
    : '<p class="muted">Nothing reported.</p>';
}
function profileForm() {
  const P = profile();
  const radio = (name, val, label) => `<label class="opt"><input type="radio" name="${name}" value="${val}"${P[name] === val ? ' checked' : ''}> ${label}</label>`;
  return `<fieldset><legend>Your textbooks</legend>${radio('cur', 'intl', 'English-language')}${radio('cur', 'vn', 'Vietnamese (SGK)')}${radio('cur', 'any', 'Not sure / both')}</fieldset>
    <fieldset><legend>Level</legend>${radio('level', 'school', 'High school')}${radio('level', 'uni', 'University')}</fieldset>`;
}
function drawSetup() {
  $('#setup').innerHTML = store.get('profile', null) ? ''
    : `<div class="card setup"><p class="lbl">Set this once</p><p>Symbols depend on where you learned physics. This helps us guess.</p>${profileForm()}<p class="row">${btn('saveprofile', 'Save', '', 'primary')}</p></div>`;
}

function route() {
  const page = (location.hash.match(/^#\/(\w+)/) || [, 'lookup'])[1];
  const target = $('#page-' + page) ? page : 'lookup';
  for (const sec of document.querySelectorAll('main > section')) sec.hidden = sec.id !== 'page-' + target;
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('on', a.getAttribute('href') === '#/' + (target === 'lookup' ? '' : target));
  $('#setup').innerHTML = $('#prof').innerHTML = ''; // one profile form at a time, or their radios share a group
  if (target === 'table') drawTable();
  if (target === 'history') drawHistory();
  if (target === 'profile') $('#prof').innerHTML = profileForm();
  if (target === 'lookup') drawSetup();
}

function boot() {
  document.documentElement.dataset.theme = store.get('theme', 'dark');
  $('#theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    store.set('theme', t);
  });
  $('#ask').addEventListener('submit', e => { e.preventDefault(); if ($('#q').value.trim()) submit($('#q').value); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-key],[data-shape],[data-go]');
    if (!b) return;
    if (b.dataset.key) { const q = $('#q'); q.setRangeText(b.dataset.key, q.selectionStart, q.selectionEnd, 'end'); q.focus(); return; }
    if (b.dataset.shape) { $('#shape-hits').innerHTML = DB.glyphs.filter(g => g.shape === b.dataset.shape).map(glyphChip).join(''); return; }
    if (b.dataset.go) { location.hash = '#/'; $('#q').value = b.dataset.go; submit(b.dataset.go); return; }
    if (b.dataset.act === 'saveprofile') { saveProfile(); drawSetup(); return; }
    if (act[b.dataset.act](b.dataset.arg) !== 'drawn') draw();
    const last = document.querySelector('#flow .step:last-child');
    if (last) last.scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'cur' || e.target.name === 'level') { saveProfile(e.target.closest('fieldset').parentElement); if (S.p) draw(); }
  });
  $('#copyq').addEventListener('click', e => {
    const json = JSON.stringify(store.get('queue', []), null, 2);
    Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(json))
      .then(() => { e.target.textContent = 'Copied'; }, () => window.prompt('Copy this:', json));
  });
  $('#clearh').addEventListener('click', () => {
    if (window.confirm('Clear your lookup history? Reported entries stay.')) { store.set('history', []); drawHistory(); }
  });
  drawKeys();
  S = blank();
  window.addEventListener('hashchange', route);
  route();
}
function saveProfile(scope = document) {
  const pick = n => (scope.querySelector(`input[name="${n}"]:checked`) || {}).value;
  store.set('profile', { cur: pick('cur') || 'any', level: pick('level') || 'school' });
}

if (document.getElementById('flow')) boot();
