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
  __proto__: null, // or NAMES['constructor'] would be found
  alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'θ', Theta: 'Θ', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', Phi: 'Φ',
  chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω', hbar: 'ℏ', nabla: '∇', partial: '∂', propto: '∝',
  infty: '∞', sqrt: '√', ell: 'ℓ', cdot: '·', times: '×', approx: '≈'
};
const VARIANTS = { 'ϕ': 'φ', 'ϵ': 'ε', 'ϑ': 'θ', 'ϱ': 'ρ', 'ħ': 'ℏ', 'µ': 'μ', '\u2126': 'Ω', '\u2206': 'Δ', '\u2211': 'Σ', '’': '′', "'": '′', '−': '-', '–': '-', '½': '1/2', '⋅': '·' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const wrap = x => x.length > 1 ? '{' + x + '}' : x;

// Turns what people type (Greek names, \rho, v₀, x², ϕ) into the one syntax the data uses.
function normalize(raw) {
  let s = String(raw).trim();
  const notes = [];
  if (NAMES[s]) return { s: NAMES[s], notes: [`“${s}” is the Greek letter ${NAMES[s]}.`] };
  s = s.replace(/[\u20d0-\u20ff\u0304\u0305]/g, '') // an arrow or a bar drawn over a letter is not part of the symbol
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/\\(?:vec|overrightarrow|bar|overline|hat|mathbf|mathrm|text)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\mathcal\{E\}/g, 'ℰ').replace(/\\([A-Za-z]+)/g, (m, n) => NAMES[n] ?? m);
  s = s.replace(/[ϕϵϑϱħµ\u2126\u2206\u2211’'−–½⋅]/g, c => {
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
    const d = dict().find(([k]) => rest.startsWith(k) && !FN.test(rest.slice(1))); // "Fcosθ" is F cos θ, not F_c o s θ
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
  return `<span class="${cls}">${esc(m[1])}</span>${m[2] ? `<sub>${esc(m[2])}</sub>` : ''}${m[3] && `<span class="prime">${m[3]}</span>`}`;
}
// Spaced with CSS margins, not spaces: an italic E swallows a plain space ("E= hf").
const OPS = { '=': '<span class="op">=</span>', '+': '<span class="op">+</span>', '-': '<span class="op">−</span>', '*': '·', '·': '·', '≈': '<span class="op">≈</span>', '∝': '<span class="op">∝</span>', '{': '', '}': '' };
function toHTML(toks) {
  let h = '';
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === 'op' && (k.v === '^' || k.v === '_')) { // superscript, or a loose subscript (v′_1): a {group}, or one token (with its minus sign)
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
      const tag = k.v === '^' ? 'sup' : 'sub';
      h += `<${tag}>${toHTML(grp)}</${tag}>`;
      i = j;
      continue;
    }
    // a minus that starts something (k = -d′/d) is a sign, not a subtraction: no space after it
    if (k.v === '-' && (!toks[i - 1] || (toks[i - 1].t === 'op' && !')}'.includes(toks[i - 1].v)))) { h += '−'; continue; }
    h += k.t === 'sym' ? symHTML(k.v) : k.t === 'fn' ? `<span class="fn">${k.v} </span>` : k.t === 'num' ? k.v : (OPS[k.v] ?? esc(k.v));
  }
  return h;
}
const render = s => toHTML(tokenize(normalize(s).s));
// Text with `formulas` between backticks (problems, AI replies). Everything outside the
// backticks is escaped, so an AI reply cannot inject markup.
const fmt = s => String(s)
  .replace(/```[^\n`]*\n([\s\S]*?)```/g, (m, body) => body.trim().split('\n').map(l => l.trim() && '`' + l.trim() + '`').join('\n')) // a code block: one formula per line
  .split(/`([^`\n]+)`/).map((part, i) => i % 2 ? `<span class="math">${render(part)}</span>` : esc(part))
  .join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

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
    syms, unit: p.unit, unitOnly: p.unitOnly, text: (p.s + ' ' + extra + ' ' + (o.words || '')).toLowerCase(), topic: o.topic || null,
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
const askBtn = (label, text) => `<button type="button" class="btn" data-ui="askai" data-arg="${esc(text)}">${label}</button>`;
const step = (n, title, body) => `<section class="step"><h2><span class="n">${n}</span>${title}</h2>${body}</section>`;
const KIND = { quantity: 'Physical quantity', constant: 'Constant', unit: 'Unit', label: 'Label (a name, not a quantity)', operator: 'Maths notation' };

let S = {};
const blank = () => ({ p: null, target: null, confirmed: false, tries: 0, topic: null, askTopic: false, idk: false, pasted: '', words: '', pasteUsed: false, showAll: false, pick: null, fb: null, rounds: 0, end: null });

function ranked() {
  return rank(S.target.sym, context(S.p, { pasted: S.pasted, words: S.words, topic: S.topic }));
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

// `words`: text that came with the input (what is printed around a formula in a photo). It is
// only searched for topic words; unlike a pasted sentence, its short words are not read as symbols.
function submit(raw, words = '') {
  if (S.p && S.confirmed && !S.end) log('abandoned', answerName());
  const tries = S.p && !S.confirmed ? S.tries : 0; // retyping after "No, let me fix it" is the same attempt
  S = { ...blank(), tries, p: parse(raw), words };
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
    else h += `<p class="row"><span class="note">The whole formula is not in our database.</span>${askBtn('Ask the AI about it', `What does this formula mean, and what does each symbol stand for?\n\n\`${p.s}\``)}</p>`;
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
    const ask = S.end === 'unresolved' ? askBtn('Ask the AI instead', `Help me work out what \`${S.target.sym || S.p.s}\` means.${S.target.sym && S.p.syms.length > 1 ? ` I saw it in \`${S.p.s}\`.` : ''}`) : '';
    return step('07', 'Done', `<p>Saved to your <a href="#/history">history</a> as <b>${S.end}</b>.</p><p class="row">${btn('new', 'New lookup', '', 'primary')}${ask}</p>`);
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

/* ---------------- popular problems ---------------- */
let probTopic = '';
// Every way a law is written, the reader's own textbooks first.
function formsOf(law) {
  const cur = profile().cur;
  const fit = f => f.cur.includes(cur) ? 2 : f.cur.includes('all') ? 1 : 0;
  return DB.formulas.filter(f => f.law === law).sort((a, b) => fit(b) - fit(a));
}
function problemHTML(p) {
  const laws = x => x.uses.map(id => formulaById(id).law);
  const close = x => (x.topic === p.topic && x.sub === p.sub) || laws(x).some(l => laws(p).includes(l));
  const others = DB.problems.filter(x => x !== p);
  const related = [...others.filter(close), ...others.filter(x => !close(x) && x.topic === p.topic)].slice(0, 3);
  const hint = p.uses.map(id => { // the form the solution uses, then how other textbooks write it
    const f = formulaById(id), rest = formsOf(f.law).filter(x => x !== f);
    return `<li><button type="button" class="btn link" data-ui="formula" data-arg="${f.id}"><span class="math">${render(f.f)}</span></button> <span class="muted">${esc(f.name)}</span>${rest.length ? `<p class="also muted small">Also written: ${rest.map(x => `<span class="math">${render(x.f)}</span>`).join('')}</p>` : ''}</li>`;
  }).join('');
  return `<details class="prob" id="prob-${p.id}"><summary>${esc(p.title)} <span class="tag">${esc(p.sub)}</span></summary>
    <p>${fmt(p.q)}</p>
    <details><summary>Hint: the formulas you need</summary><ul class="forms">${hint}</ul></details>
    <details><summary>Solution</summary><ol>${p.steps.map(s => `<li>${fmt(s)}</li>`).join('')}</ol><p><b>Answer.</b> ${fmt(p.answer)}</p></details>
    <p class="warn"><b>Watch the notation.</b> ${fmt(p.trap)}</p>
    <p class="row">${askBtn('Ask the AI for a hint', `Give me a hint for this problem, not the full solution.\n\n${p.q}`)}</p>
    ${related.length ? `<p class="muted small">Related: ${related.map(x => `<a href="#/problems/${x.id}">${esc(x.title)}</a>`).join(' · ')}</p>` : ''}
  </details>`;
}
function drawProblems(openId) {
  const open = DB.problems.find(p => p.id === openId);
  if (open && probTopic !== open.topic) probTopic = '';
  const topics = [...new Set(DB.problems.map(p => p.topic))];
  $('#probs').innerHTML = `<p class="row">${['', ...topics].map(t => `<button type="button" class="btn${t === probTopic ? ' primary' : ''}" data-ui="ptopic" data-arg="${t}">${t ? esc(DB.topics[t]) : 'All subjects'}</button>`).join('')}</p>`
    + topics.filter(t => !probTopic || t === probTopic).map(t => `<h2 class="sub">${esc(DB.topics[t])}</h2>${DB.problems.filter(p => p.topic === t).map(problemHTML).join('')}`).join('');
  if (open) { const el = $('#prob-' + open.id); el.open = true; el.scrollIntoView(); }
}

/* ---------------- AI helper: optional, the rest of the site works without it ---------------- */
// Calls the Claude API straight from the browser with the reader's own key. To hide a key behind
// your own server later, point AI_URL at that server and let it add the key.
const AI_URL = 'https://api.anthropic.com/v1/messages';
const MODELS = {
  'claude-opus-5-5': 'Claude Opus 5.5: most capable',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5: faster and cheaper',
  'claude-haiku-5-5': 'Claude Haiku 5.5: fastest and cheapest'
};
const aiCfg = () => store.get('ai', { key: '', model: Object.keys(MODELS)[0] });

// The models think before they answer and that thinking counts toward max_tokens, so `max` leaves
// room for it. `effort` (low, medium, high) sets how much they think.
async function ai(system, messages, max, effort, cfg = aiCfg()) {
  let res, data;
  try {
    res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.model, max_tokens: max, output_config: { effort }, system, messages })
    });
    data = await res.json().catch(() => ({}));
  } catch { throw new Error('Could not reach the AI service. Check your internet connection and try again.'); }
  if (res.status === 401) throw new Error('The API key was not accepted. Check it in AI settings.');
  if (!res.ok) throw new Error(`The AI service said: ${(data.error || {}).message || 'error ' + res.status}`);
  if (data.stop_reason === 'refusal') throw new Error('The AI declined to answer this one. Reword the question, or choose another model in AI settings.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw new Error(data.stop_reason === 'max_tokens' ? 'The AI ran out of room before it answered. Try again.' : 'The AI sent an empty answer. Try again.');
  return text + (data.stop_reason === 'max_tokens' ? '\n\n(The answer was cut off here. Ask it to continue.)' : '');
}

const TUTOR = `You are the study helper inside drowninginsymbols, a website that helps physics beginners work out what symbols and formulas mean. Physics notation is not universal: the same letter means different things in different topics, countries and textbooks.

What you help with:
- Finding or identifying a symbol or formula. Say what it most likely means in the student's context and why (the unit, the other symbols, the topic). If the context does not settle it, list the possible meanings by topic, or ask one short question.
- Homework. Work step by step: list what is given with units, name the formula and say why it applies, say what each symbol stands for the first time it appears, put in the numbers with units, then sanity-check the result. If the student shows their own working, check it first and point to the first step that goes wrong. If the student asks for a hint, give only the next step and stop; keep to one step at a time until they ask for the full solution.
- Photos. First say how you read the formula or problem in the photo, so the student can correct you.

Rules:
- The notation database below is the website's checked source. Use it for what a symbol means and for how each textbook tradition writes a formula ("intl" = English-language textbooks, "vn" = Vietnamese SGK textbooks, "all" = both). If something is not in it, answer from general physics knowledge and say that it is not in the site's database.
- Notation: write with the letters the student used in their question or photo. If they used none, use the notation of their textbooks (stated at the end). If that is not known, use the form marked "all" when there is one, otherwise give the "intl" and the "vn" form side by side. When the other tradition writes the same law differently, add one line saying so. Watch for sign conventions, not just letters.
- Reply in the language the student writes in. The sentence "Please read this photo and help me with it." is added by the website when a photo is sent without text: then reply in the language of the photo. Be brief and plain: the student is a beginner.
- Stay on physics, the maths it needs, and study help.

Format: plain text. No Markdown headings, tables or code blocks, no LaTeX, no backslashes, no dollar signs. **Bold** is allowed for a few key words, never around a formula.
Put every symbol and formula between single backticks, one formula per pair and on one line, in this syntax, which the website draws as maths:
- Greek letters as characters (ρ, λ, Δ). No arrows or bars over letters: say in words that something is a vector or an average.
- Subscripts with _, always in braces when longer than one character: v_0, F_{net}, v_{max}, m_{water}. On one letter the order is subscript, prime, power: v_1′, v_0^2.
- Powers with ^ (v^2, e^{-λt}); fractions with / and brackets, as in (1/2) m v^2; roots as √( ).
- Multiplication: put a space between the symbols, and before and after sin, cos, tan, ln, log: p V = n R T, F_x = F cos θ. Never glue two letters together, except a name printed as one symbol, such as KE or PE.
Inside backticks go symbols and the pure numbers that belong to a formula (1/2, 2π). Measured values, units and arithmetic stay outside as normal text, like this: \`v = v_0 + a t\`, so \`v\` = 0 + 2.0 × 5.0 = 10 m/s. Also outside: 9.8 m/s², 3.0 × 10⁸ m/s. Name isotopes in words (carbon-14, uranium-238).`;
let AI_DB = null; // the database as compact text: built once, and cached by the API between questions
const aiDB = () => AI_DB ??= 'SYMBOLS (symbol | meaning | Vietnamese name | topic | kind | SI unit | textbooks)\n'
  + DB.meanings.map(m => [m.sym, m.name, m.vi || '', m.topic, m.kind, m.unit || '', m.cur.join(',')].join(' | ')).join('\n')
  + '\n\nFORMULAS (formula | name | law | topic | textbooks | note). Rows that share a law are the same law as different textbooks write it.\n'
  + DB.formulas.map(f => [f.f, f.name, f.law, f.topic, f.cur.join(','), f.note || ''].join(' | ')).join('\n');
function tutorSystem() {
  const P = profile();
  return [
    { type: 'text', text: TUTOR + '\n\n' + aiDB(), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `This student's textbooks: ${P.cur === 'any' ? 'not known, could be either tradition' : DB.cur[P.cur]}. Level: ${P.level === 'uni' ? 'university' : 'high school'}.` }
  ];
}

// Shrinks a photo in the browser before it is sent: less to upload, cheaper to read.
async function shrink(file, max = 1568) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('That file could not be opened as an image. Try a JPEG or PNG.'); });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; // a see-through PNG would otherwise turn black as a JPEG
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
const imgBlock = url => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] } });

let chat = [], chatImg = null, chatBusy = false, chatErr = '';
function drawChat() {
  const who = { user: 'You', assistant: 'AI' };
  $('#chatlog').innerHTML = chat.map(m => `<div class="msg"><p class="lbl">${who[m.role]}</p>${
    (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content).map(b => b.type === 'image'
      ? `<img class="thumb" src="data:image/jpeg;base64,${b.source.data}" alt="Your photo">`
      : `<div class="body">${fmt(b.text)}</div>`).join('')}</div>`).join('')
    + (chatBusy ? '<div class="msg"><p class="lbl">AI</p><p class="muted">Thinking…</p></div>' : '')
    + (chatErr ? `<p class="warn">${esc(chatErr)}</p>` : '');
  $('#chatimg').innerHTML = chatImg ? `<img class="thumb" src="${chatImg}" alt="Attached photo"><p class="row"><button type="button" class="btn" data-ui="unattach">Remove photo</button></p>` : '';
  const last = $('#chatlog').lastElementChild;
  if (last) last.scrollIntoView({ block: 'nearest' });
}
function drawAi() {
  const c = aiCfg();
  $('#aimodel').innerHTML = Object.entries(MODELS).map(([id, label]) => `<option value="${id}"${id === c.model ? ' selected' : ''}>${esc(label)}</option>`).join('');
  $('#aikey').value = '';
  $('#aikey').placeholder = c.key ? `Saved key ends in …${c.key.slice(-4)}. Paste a new one to replace it.` : 'sk-ant-…';
  $('#aistate').textContent = c.key ? 'A key is saved in this browser.' : 'No key saved. The rest of the site works without one.';
  if (!c.key) $('#aiset').open = true;
  drawChat();
}
async function sendChat() {
  const text = $('#msg').value.trim(), img = chatImg, mine = chat;
  if (chatBusy || (!text && !img)) return;
  if (!aiCfg().key) { chatErr = 'Add your API key in AI settings first.'; $('#aiset').open = true; drawChat(); return; }
  mine.push({ role: 'user', content: [...(img ? [imgBlock(img)] : []), { type: 'text', text: text || 'Please read this photo and help me with it.' }] });
  $('#msg').value = '';
  chatImg = null; chatBusy = true; chatErr = '';
  drawChat();
  let reply, err = '';
  try { reply = await ai(tutorSystem(), mine, 16000, 'medium'); } catch (e) { err = e.message; }
  if (chat !== mine) return; // "New chat" was pressed while waiting
  chatBusy = false;
  if (err) { // take the question back out, so it can be sent again
    mine.pop();
    if (!$('#msg').value) $('#msg').value = text;
    chatImg = chatImg || img;
    chatErr = err;
  } else mine.push({ role: 'assistant', content: reply });
  drawChat();
}

/* ---------------- look up from a photo ---------------- */
// The AI only reads the photo (shape -> characters). What the symbols mean still comes from the database.
const READER = `You read photos for a physics notation website. Find every formula, equation or stand-alone symbol in the image, printed or handwritten, and copy it out. Do not solve or explain anything.

Reply with one JSON object and nothing else:
{"formulas": ["..."], "text": "...", "note": "..."}
- formulas: each formula or symbol, in reading order, at most 8, in the syntax below. An empty list if there is none.
- text: the words printed right next to the formulas, copied as written in their own language, at most 40 words. Empty if there are none.
- note: one short sentence, only if something was hard to read (for example "the subscript could be 0 or o"). Otherwise empty.

Syntax (plain characters only: no LaTeX, no backslashes, no dollar signs):
- Letters exactly as written, keeping upper and lower case. Greek letters as characters (ρ, λ, Δ, Σ, ω), never as names. A curly script E (emf) is ℰ.
- Leave out arrows, bars, hats and dots drawn over a letter, and ignore bold: a vector F is just F.
- Subscripts with _, in braces when longer than one character (v_0, F_{ms}, T_{1/2}). Powers with ^ (v^2, e^{-λt}). Primes with ′ (d′). On one letter the order is subscript, prime, power: v_1′, v_0^2.
- Fractions with / and brackets: (1/2) m v^2, G m_1 m_2/r^2. Square roots as √( ).
- Multiplication: put a space between the symbols, and before and after sin, cos, tan, tg, cot, cotg, ln, lg, log: p V = n R T, A = F s cos α, n_1 sin i = n_2 sin r, k q_1 q_2/(ε r^2). Never glue two letters together, except a name printed as one symbol, such as KE or PE.
- Between numbers the multiplication sign is ·, whatever the page prints (a dot, × or x): 9·10^9, 1,6·10^{-19}.
- A value with its unit is one entry, with a space before the unit: Q = 5 C, g = 9,8 m/s^2. In any other kind of entry, leave the units out.`;
let shot = null, page = 'lookup', pickFor = 'shot';
function drawShot() {
  const s = shot;
  if (!s) { $('#shot').innerHTML = ''; return; }
  let h = '<p class="lbl">From your photo</p>';
  if (s.busy) h += '<p>Reading your photo…</p>';
  else if (s.nokey) h += '<p>Reading a photo needs the AI helper. <a href="#/ai">Add your API key under Ask AI</a>, then choose the photo again. Until then, type the formula or use the symbol keyboard.</p>';
  else if (s.err) h += `<p class="warn">${esc(s.err)}</p>`;
  else if (!s.formulas.length) h += '<p>We could not find a formula or a symbol in this photo. Try a closer, sharper photo, or type it in.</p>';
  else h += `<p>${s.formulas.length > 1 ? 'We found these. Pick the one you are stuck on:' : 'We found this. Check it against your photo:'}</p>
    <p class="row">${s.formulas.map(f => `<button type="button" class="btn" data-go="${esc(f)}"><span class="math">${render(f)}</span></button>`).join('')}</p>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}`;
  h += `<p class="row">${s.url && !s.busy && !s.nokey ? '<button type="button" class="btn" data-ui="shotask">Ask the AI about this photo</button>' : ''}<button type="button" class="btn" data-ui="shotremove">Remove photo</button></p>`;
  $('#shot').innerHTML = `<div class="card shot">${s.url ? `<img src="${s.url}" alt="Your photo">` : ''}<div>${h}</div></div>`;
}
async function readPhoto(file) {
  const mine = shot = { busy: true };
  try { mine.url = await shrink(file); } catch (e) { mine.err = e.message; }
  if (!mine.err && !aiCfg().key) mine.nokey = true;
  if (!mine.err && !mine.nokey) {
    if (shot === mine) drawShot();
    try {
      const reply = await ai(READER, [{ role: 'user', content: [imgBlock(mine.url), { type: 'text', text: 'Read this image.' }] }], 4000, 'low');
      const from = reply.indexOf('{');
      let out = from < 0 ? {} : null; // no JSON at all: nothing was found
      for (let to = reply.lastIndexOf('}'); !out && to > from; to = reply.lastIndexOf('}', to - 1)) {
        try { out = JSON.parse(reply.slice(from, to + 1)); } catch { /* chatter after the object: try a shorter slice */ }
      }
      if (!out) throw new SyntaxError('no JSON object in the reply');
      mine.formulas = (Array.isArray(out.formulas) ? out.formulas : []).map(f => String(f).trim().slice(0, 200)).filter(Boolean).slice(0, 8);
      mine.text = String(out.text || '').slice(0, 400);
      mine.note = String(out.note || '').slice(0, 200);
    } catch (e) { mine.err = e instanceof SyntaxError ? 'The AI reply could not be understood. Try the photo again.' : e.message; }
  }
  mine.busy = false;
  if (shot !== mine) return; // another photo was chosen while waiting
  drawShot();
  if (!mine.err && !mine.nokey && mine.formulas.length === 1) { $('#q').value = mine.formulas[0]; submit(mine.formulas[0], mine.text); }
}
// A photo from the file picker, a paste or a drop goes to the page that is showing.
function usePhoto(file, where = page === 'ai' ? 'chat' : page === 'lookup' ? 'shot' : '') {
  if (!file || !where || (file.type && !file.type.startsWith('image/'))) return;
  if (where === 'shot') { readPhoto(file); return; }
  shrink(file).then(url => { chatImg = url; chatErr = ''; }, e => { chatErr = e.message; }).then(drawChat);
}

// Leaving a problem (to a formula card or the AI) records which one, so Back reopens it.
const keepPlace = b => {
  const pr = b.closest('.prob');
  try { if (pr) history.replaceState(null, '', '#/problems/' + pr.id.slice(5)); } catch { /* refused on some file:// pages: Back then lands on the list */ }
};
// Buttons outside the lookup flow: data-ui names the handler, data-arg is its argument.
const ui = {
  askai(text, b) { keepPlace(b); $('#msg').value = text; location.hash = '#/ai'; },
  pick(where) { pickFor = where; $('#file').click(); },
  shotask() { chatImg = shot.url; location.hash = '#/ai'; },
  shotremove() { shot = null; drawShot(); },
  unattach() { chatImg = null; drawChat(); },
  ptopic(t) { probTopic = t; drawProblems(); },
  formula(id, b) { // from a problem to that formula's card on the lookup page
    keepPlace(b);
    const f = formulaById(id);
    $('#q').value = f.f;
    submit(f.f);
    Object.assign(S, { target: { formula: id }, confirmed: true });
    location.hash = '#/';
    route();
    draw();
    $('#flow').scrollIntoView();
  },
  newchat() { chat = []; chatImg = null; chatBusy = false; chatErr = ''; $('#msg').value = ''; drawChat(); },
  aisave() {
    store.set('ai', { key: $('#aikey').value.trim() || aiCfg().key, model: $('#aimodel').value });
    chatErr = '';
    $('#aiset').open = !aiCfg().key;
    drawAi();
  },
  aiforget() { store.set('ai', { key: '', model: $('#aimodel').value }); drawAi(); }
};

function route() {
  const [, name, arg] = location.hash.match(/^#\/(\w+)(?:\/([\w-]+))?/) || [];
  page = $('#page-' + name) ? name : 'lookup';
  for (const sec of document.querySelectorAll('main > section')) sec.hidden = sec.id !== 'page-' + page;
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('on', a.getAttribute('href') === '#/' + (page === 'lookup' ? '' : page));
  $('#setup').innerHTML = $('#prof').innerHTML = ''; // one profile form at a time, or their radios share a group
  if (page === 'table') drawTable();
  if (page === 'history') drawHistory();
  if (page === 'profile') $('#prof').innerHTML = profileForm();
  if (page === 'lookup') drawSetup();
  if (page === 'problems') drawProblems(arg);
  if (page === 'ai') drawAi();
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
    const same = e.target.closest('a[href^="#/problems/"]'); // a link to the problem already in the address: no hashchange fires
    if (same && same.getAttribute('href') === location.hash) { route(); return; }
    const b = e.target.closest('[data-act],[data-key],[data-shape],[data-go],[data-ui]');
    if (!b) return;
    if (b.dataset.ui) { ui[b.dataset.ui](b.dataset.arg, b); return; }
    if (b.dataset.key) { const q = $('#q'); q.setRangeText(b.dataset.key, q.selectionStart, q.selectionEnd, 'end'); q.focus(); return; }
    if (b.dataset.shape) { $('#shape-hits').innerHTML = DB.glyphs.filter(g => g.shape === b.dataset.shape).map(glyphChip).join(''); return; }
    if (b.dataset.go) { location.hash = '#/'; $('#q').value = b.dataset.go; submit(b.dataset.go, b.closest('#shot') && shot ? shot.text : ''); return; }
    if (b.dataset.act === 'saveprofile') { saveProfile(); drawSetup(); return; }
    if (act[b.dataset.act](b.dataset.arg) !== 'drawn') draw();
    const last = document.querySelector('#flow .step:last-child');
    if (last) last.scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'aimodel') { store.set('ai', { ...aiCfg(), model: e.target.value }); return; }
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
  $('#chat').addEventListener('submit', e => { e.preventDefault(); sendChat(); });
  $('#msg').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendChat(); } });
  $('#file').addEventListener('change', e => { usePhoto(e.target.files[0], pickFor); e.target.value = ''; });
  document.addEventListener('paste', e => {
    const f = [...((e.clipboardData || {}).files || [])].find(x => x.type.startsWith('image/'));
    if (!f || e.clipboardData.getData('text')) return; // copied text sometimes carries a picture of itself
    e.preventDefault();
    usePhoto(f);
  });
  // Without these two, dropping a file anywhere makes the browser leave the site to show it.
  document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); usePhoto(e.dataTransfer.files[0]); } });
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
