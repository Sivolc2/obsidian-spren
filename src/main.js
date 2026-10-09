// Spren for Obsidian: idea-organisms on the graph view.
// It reads notes and, only when you press Save, writes one note. It makes no network requests.
// Generated from the Spren repository by tools/package_plugin.py; edit there.
import { Plugin, Notice, TFile, normalizePath, sanitizeHTMLToDom } from 'obsidian';
import * as sim from './engine/sim.js';
import * as draw from './engine/draw.js';
import circuitText from './engine/fly_circuit.json';

// Put markup into an element without innerHTML. In Obsidian it goes through the app's sanitiser; if that
// drops the controls (or is not there, as in the test page) the markup, whose every value was escaped
// where it was built, is parsed as a fragment instead.
function setHtml(el, html) {
  let frag = typeof sanitizeHTMLToDom === 'function' ? sanitizeHTMLToDom(html) : null;
  if (!frag || (html.includes('data-act') && !frag.querySelector('[data-act]'))) frag = el.ownerDocument.createRange().createContextualFragment(html);
  el.replaceChildren(frag);
}

const VOCAB = 1400, NEIGHBOURS = 24, MAX_SENTENCES = 40000;

const STOP = new Set(`the and of to in a that he for his is you was it they with be not i will him them shall from all
have my on your as were had but said their are when by this who me which there out so up we then her she one what or an
at has also into no if those do did these came may because went come let us our been after before over would upon like
against now even its about than more am how where every any down say says should could again among through under
whom whose until while each other some does done made make give gave given take took put set go going see saw know
himself themselves therefore away being many two three very both here just only must can cannot yet still though thus
without toward within neither nor since much way things thing back around another first same nothing something anyone
everyone get got really think kind lot actually also well going want need like just don doesn isn can will not`.split(/\s+/));

// ---- text ----
const clean = text => text
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .replace(/```[\s\S]*?```/g, ' ')
  .split('\n').filter(l => !/^\s*(#|\||>?\s*\[!|- \[.\]|!\[)/.test(l)).join('\n')
  .replace(/!\[\[[^\]]*\]\]/g, ' ')
  .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ')
  .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '').replace(/[*_`~>#]/g, '').replace(/[ \t]+/g, ' ');
const wordsOf = s => [...new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length > 2 && !STOP.has(w)))];
const family = path => { const base = path.split('/').pop().replace(/\.md$/, ''); return base.includes(' - ') ? base.split(' - ')[0] : path.includes('/') ? path.split('/')[0] : 'Notes'; };

// How words keep company (normalised PMI over passages), as in tools/build_soup.mjs.
// corpus: a list of word lists. need: words that must be in the vocabulary.
function company(corpus, need) {
  const df = new Map(); for (const s of corpus) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  const vocab = [...df].filter(([w, c]) => c >= 2 || need.has(w)).sort((a, b) => need.has(b[0]) - need.has(a[0]) || b[1] - a[1]).slice(0, VOCAB).map(x => x[0]);
  const index = new Map(vocab.map((w, i) => [w, i])), pair = new Map(), N = Math.max(1, corpus.length);
  for (const s of corpus) {
    const ids = s.map(w => index.get(w)).filter(i => i !== undefined).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] * VOCAB + ids[j]; pair.set(k, (pair.get(k) ?? 0) + 1); }
  }
  const near = vocab.map(() => []);
  for (const [k, c] of pair) {
    if (c < 2) continue;
    const a = Math.floor(k / VOCAB), b = k % VOCAB, pa = df.get(vocab[a]) / N, pb = df.get(vocab[b]) / N, pab = c / N;
    const npmi = Math.log(pab / (pa * pb)) / -Math.log(pab);
    if (npmi > 0.05) { near[a].push([b, npmi]); near[b].push([a, npmi]); }
  }
  const kin = near.map(l => l.sort((x, y) => y[1] - x[1]).slice(0, NEIGHBOURS).map(([i, v]) => [i, +v.toFixed(3)]));
  const virtues = [...df].filter(([w]) => index.has(w) && w.length > 3).sort((a, b) => b[1] - a[1]).slice(0, 20).map(x => x[0]);
  return { vocab, kin, virtues: virtues.length ? virtues : ['idea'] };
}

// ---- overlay: organisms on Obsidian's own graph view ----
// Here a note is one idea: its title and the first 100 characters of its text. The organisms live in the
// graph's own coordinates and are drawn on a clear canvas laid over it. A note an organism has eaten stays
// where the graph puts it, ringed in that organism's colour and joined to it by a line.
//
// The graph view has no public API. This reads renderer.nodes ({ id, x, y }), renderer.panX / panY and
// renderer.scale, which other plugins also rely on but which Obsidian may change.
const head = (title, text) => `${title}. ${clean(text).replace(/\s+/g, ' ').trim().slice(0, 100)}`;
function noteSoup(notes, groups = null) {   // notes: [{ path, text, tags, at: [x, y] in the unit disc }]. groups: [{ name, tag, color }], first match wins, as in Obsidian's graph
  let lands, homeOf;
  if (groups) {
    lands = [...groups.map(g => ({ name: g.name, color: g.color })), { name: 'Other' }];
    homeOf = n => { const k = groups.findIndex(g => (n.tags ?? []).includes(g.tag)); return k < 0 ? groups.length : k; };
  } else {
    const count = new Map(); for (const n of notes) count.set(family(n.path), (count.get(family(n.path)) ?? 0) + 1);
    const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 7).map(x => x[0]), other = count.size > top.length;
    lands = [...top.map(f => ({ name: f })), ...(other ? [{ name: 'Other' }] : [])];
    homeOf = n => top.indexOf(family(n.path)) < 0 ? top.length : top.indexOf(family(n.path));
  }
  const ideas = notes.map(n => ({ t: head(n.path.split('/').pop().replace(/\.md$/, ''), n.text), src: n.path.replace(/\.md$/, ''),
    home: homeOf(n), tags: [...new Set([...(n.tags ?? []), family(n.path).toLowerCase()])].slice(0, 4), at: n.at }));
  const lists = ideas.map(i => wordsOf(i.t));
  return { name: 'Graph', ideas, lands, ...company(lists, new Set(lists.flat())), sim: null, simN: 0 };
}

// A query is finished when the organism is full, when what it holds hangs together well enough, or when it has run out of time.
const FULL = 12, COHERE = 0.16, COHERE_MIN = 8, TIME_OUT = 9000;

class Overlay {
  // renderer: the graph view's renderer. graphCanvas: the canvas it draws on. notes: [{ path, text, tags }] for its nodes.
  // mods: { sim, draw } (the page's own modules). circuit: the fly brain, or null.
  constructor(renderer, graphCanvas, notes, mods, circuit = null) {
    Object.assign(this, { r: renderer, gc: graphCanvas, mods, speed: 0.5, carry: 0, mode: 0, running: false, plate: 0 });   // speed: simulation ticks per frame; starts slow
    const { World, PRESETS, W, H } = mods.sim, node = new Map(renderer.nodes.map(n => [n.id, n]));
    notes = notes.filter(n => node.has(n.path));
    const xs = notes.map(n => node.get(n.path).x), ys = notes.map(n => node.get(n.path).y);
    this.cx = (Math.min(...xs) + Math.max(...xs)) / 2; this.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const far = Math.max(1, ...notes.map(n => Math.hypot(node.get(n.path).x - this.cx, node.get(n.path).y - this.cy)));
    for (const n of notes) n.at = [(node.get(n.path).x - this.cx) / far, (node.get(n.path).y - this.cy) / far];
    const plate = this.plate = Math.max(470, Math.min(760, 40 * Math.sqrt(notes.length)));
    this.k = (plate - 40) / far;   // world units per graph unit
    const pop = [];   // the graph starts empty: every organism on it is one you asked for
    // on the graph the organisms are drawn small, about the size of a few nodes, so they sit among the notes instead of covering them
    this.world = new World({ ...noteSoup(notes), grain: 0.25 }, { pop, circuit, map: 'dish', plate, mortal: false }, Date.now() % 1e6);
    this.following = false;
    this.sel = null; this.paused = false; this.frame = 0;
    this.world.turned = q => [W / 2 + q[0], H / 2 + q[1]];   // the graph decides where things are; the dish does not turn
    this.pins = this.world.particles.map(p => ({ idea: p.idea, node: node.get(p.idea.src + '.md') })).filter(x => x.node);
    for (const { idea } of this.pins) idea.slot.r = 0;
    this.nodeOf = new Map(this.pins.map(x => [x.idea, x.node]));
    this.cv = graphCanvas.ownerDocument.createElement('canvas');
    this.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5';
    graphCanvas.parentElement.appendChild(this.cv);
    // the panel: who is here, what the chosen one holds and last decided, and a few controls
    this.panel = graphCanvas.ownerDocument.createElement('div');
    this.panel.style.cssText = 'position:absolute;left:12px;bottom:12px;width:300px;max-height:62%;overflow:auto;z-index:6;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.45;'
      + 'background:var(--background-secondary,#202020);border:1px solid var(--background-modifier-border,#444);color:var(--text-normal,#ddd)';
    graphCanvas.parentElement.appendChild(this.panel);
    // The query form is built once and left alone, so typing in it is never interrupted; the rest is redrawn.
    const { TYPES } = mods.sim;
    this.form = this.panel.appendChild(graphCanvas.ownerDocument.createElement('div'));
    {   // the form: a title row, the query box and kind menu, and the button with its hint
      const doc = graphCanvas.ownerDocument, el = (tag, parent, style, text) => { const e = parent.appendChild(doc.createElement(tag)); if (style) e.style.cssText = style; if (text) e.textContent = text; return e; };
      const head = el('div', this.form, 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px');
      el('b', head, '', 'Spren'); el('span', head, 'opacity:.6', 'ask the graph');
      const row = el('div', this.form, 'display:flex;gap:4px;margin-bottom:4px');
      const q = el('input', row, 'flex:1;min-width:0'); q.dataset.q = ''; q.placeholder = 'a word or phrase to look for';
      const kinds = el('select', row); kinds.dataset.kind = ''; kinds.title = 'How it reads what it finds';
      for (const k of Object.keys(TYPES).filter(k => !TYPES[k].apart && (k !== 'fly' || circuit))) { const o = el('option', kinds, '', TYPES[k].name); o.value = k; o.title = TYPES[k].blurb; o.selected = k === (circuit ? 'fly' : 'forager'); }
      const foot = el('div', this.form, 'display:flex;gap:6px;align-items:center;margin-bottom:8px');
      el('button', foot, '', 'Create and send out').dataset.make = ''; el('span', foot, 'opacity:.7').dataset.hint = '';
    }
    this.dyn = this.panel.appendChild(graphCanvas.ownerDocument.createElement('div'));
    const input = this.form.querySelector('[data-q]');
    for (const ev of ['keydown', 'keyup', 'keypress']) input.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter') this.query(); });   // keep Obsidian's hotkeys out of the typing
    this.form.querySelector('[data-make]').addEventListener('click', () => this.query());
    this.dyn.addEventListener('click', e => {
      const t = e.target.closest('[data-act],[data-c],[data-src]'); if (!t) return;
      if (t.dataset.act) this.act(t.dataset.act); else if (t.dataset.c) this.sel = +t.dataset.c; else this.onOpen?.(t.dataset.src);
      this.fill();
    });
    this.fill();
  }
  // A query: make a new organism whose first core idea is what you typed, which it can never lose,
  // set it down in the middle of the view, and let it gather the notes that belong with those words.
  query() {
    const input = this.form.querySelector('[data-q]'), hint = this.form.querySelector('[data-hint]'), text = input.value.trim(), w = this.world;
    if (!text) { hint.textContent = 'Type something to look for first.'; return; }
    const { W, H } = this.mods.sim, kind = this.form.querySelector('[data-kind]').value, f = this.f(), d = window.devicePixelRatio || 1;
    const gx = (this.cv.clientWidth * d / 2 / f - this.r.panX) / this.r.scale, gy = (this.cv.clientHeight * d / 2 / f - this.r.panY) / this.r.scale;
    let wx = (gx - this.cx) * this.k, wy = (gy - this.cy) * this.k; const m = Math.hypot(wx, wy), lim = this.plate * 0.8; if (m > lim) { wx *= lim / m; wy *= lim / m; }
    const seed = w.idea(text, 'seed', undefined, { tags: text.toLowerCase().match(/[\w-]+/g) ?? [] }); w.minted++;   // its words double as labels, which is what an Empath reads
    // Start it where the query already has company: one pass over the notes, scoring each by how well its
    // words go with the query's (and more if it uses the very words). Among the best few, take the one with
    // most of the others near it, so it lands in a neighbourhood and not on a lone match.
    const t0 = performance.now(), qw = new Set(seed.words), scored = [], adrift = new Set(w.particles.map(p => p.idea));
    for (const { idea, node } of this.pins) {
      if (!adrift.has(idea)) continue;   // already taken by another organism
      const exact = idea.words.filter(x => qw.has(x)).length / Math.max(1, qw.size), v = w.aff.kin(seed, idea) + 0.5 * exact;
      if (v > 0.02) scored.push([v, idea, node]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const best = scored.slice(0, 8), near = 160 / this.k;
    const home = best.map(a => [a[0] + 0.25 * best.filter(b => b !== a && Math.hypot(a[2].x - b[2].x, a[2].y - b[2].y) < near).reduce((n, b) => n + b[0], 0), a]).sort((a, b) => b[0] - a[0])[0]?.[1];
    if (home) { wx = (home[2].x - this.cx) * this.k + 12; wy = (home[2].y - this.cy) * this.k + 12; }
    this.lastPlacing = { ms: performance.now() - t0, matches: scored.length };
    const c = w.spawn(kind, seed, W / 2 + wx, H / 2 + wy);
    c.query = text; c.cap = Math.max(c.cap, FULL); this.sel = c.id; input.value = '';   // every query has room for the same number of finds
    c.startedNear = home ? home[1].src.split('/').pop() : null;
    const known = seed.words.filter(x => w.soup.vocab.includes(x));
    hint.textContent = c.startedNear ? `#${c.id} starts beside “${c.startedNear.slice(0, 40)}”. Press Follow to go to it.` : known.length ? `#${c.id} is out looking from the middle of the view.` : `None of those words occurs in these notes' openings, so #${c.id} has little to go on.`;
    this.fill();
  }
  // Follow: keep the chosen organism in the middle by moving the graph's own view, zooming in on it to begin with.
  follow() {
    const c = this.world.creatures.find(x => x.id === this.sel); if (!c) return;
    const { W, H } = this.mods.sim, r = this.r, f = this.f(), d = window.devicePixelRatio || 1;
    const want = 46 * d * this.k / (this.world.radius(c) * f);   // the scale at which it is about 46 pixels across its radius
    // it zooms in once, when following starts; after that the zoom is yours and it only keeps the organism in the middle
    const zooming = this.zoomFrames-- > 0, scale = zooming ? r.scale + (want - r.scale) * 0.1 : r.scale, gx = this.cx + (c.x - W / 2) / this.k, gy = this.cy + (c.y - H / 2) / this.k;
    const px = this.cv.clientWidth * d / 2 / f - gx * scale, py = this.cv.clientHeight * d / 2 / f - gy * scale;
    const nx = r.panX + (px - r.panX) * 0.2, ny = r.panY + (py - r.panY) * 0.2;
    if (zooming) { if ('targetScale' in r) r.targetScale = scale; r.scale = scale; }
    if (typeof r.setPan === 'function') r.setPan(nx, ny); else { r.panX = nx; r.panY = ny; }
    if (typeof r.changed === 'function') r.changed();   // ask the graph to redraw at its new place
  }
  act(a) {
    if (a === 'follow') { this.following = !this.following; this.zoomFrames = 45; return; }
    if (a === 'pause') this.paused = !this.paused; else if (a === 'faster') this.speed = Math.min(16, this.speed + 0.5); else if (a === 'slower') this.speed = Math.max(0.5, this.speed - 0.5);   // in steps of a half
    else if (a === 'centre') this.gather(); else if (a === 'close') this.onClose?.();
    const c = this.world.creatures.find(x => x.id === this.sel);
    if (a === 'copy' && c?.done) navigator.clipboard?.writeText(this.noteFor(c).body);
    if (a === 'save' && c?.done) { const n = this.noteFor(c); this.onSave?.(n.title, n.body); c.saved = true; }
    if (a === 'finish' && c?.query && !c.done) this.finish(c, 'you called it in');
    if (a === 'release' && c) {   // let it go: what it held goes back to the graph
      for (const i of this.world.leaves(this.world.held(c))) if (i !== c.seed) this.world.drop(i, c.x, c.y);
      this.world.creatures.splice(this.world.creatures.indexOf(c), 1); this.sel = this.world.creatures.at(-1)?.id ?? null;
    }
  }
  finds(c) { return [...c.core, ...c.body].filter(i => i !== c.seed && !i.pod).map(i => [this.world.fit(c, i), i]).sort((x, y) => y[0] - x[0]); }
  // it stops where it is and holds what it found
  finish(c, reason) { c.done = { reason, tick: this.world.tick }; c.station = [c.x, c.y]; c.arrived = true; c.target = null; this.sel = c.id; this.onDone?.(c); }
  checkDone() {
    const w = this.world;
    for (const c of w.creatures) {
      if (!c.query || c.done || c.state !== 'roam') continue;
      const held = c.core.length + c.body.length - 1;
      if (c.body.length >= c.cap) this.finish(c, 'it was full');
      else if (held >= COHERE_MIN && w.coherence(c) >= COHERE) this.finish(c, `what it held hung together (${w.coherence(c).toFixed(2)})`);
      else if (w.tick - c.born > TIME_OUT) this.finish(c, held ? 'it ran out of time' : 'it ran out of time without finding anything');
    }
  }
  // the result as a note: what was asked, how it ended, and the notes found, as links
  noteFor(c) {
    const { TYPES } = this.mods.sim, found = this.finds(c), link = i => `[[${i.src.split('/').pop()}]]`, core = c.core.filter(i => i !== c.seed && !i.pod);
    const day = new Date().toISOString().slice(0, 10), kind = TYPES[c.type].name, q = c.query.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();   // the query goes into a note, so no markup and one line
    return { title: `Spren - ${c.query.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').trim().slice(0, 60)} - ${day}`, body: `---
tags: [spren]
query: ${JSON.stringify(q)}
organism: ${kind}
found: ${found.length}
created: ${day}
---
# Spren: “${q}”

A ${kind} was set down on the graph with “${q}” as its first core idea. It stopped after ${(c.done.tick - c.born).toLocaleString()} ticks because ${c.done.reason}.

## What it found, best fit first
${found.map(([v, i]) => `- ${link(i)} (fit ${v.toFixed(2)})`).join('\n') || '- nothing'}
${core.length ? `\n## What it came to be about\n${core.map(i => `- ${link(i)}`).join('\n')}\n` : ''}
_Made by the Spren overlay. ${kind}: ${TYPES[c.type].blurb}_
` };
  }
  fill() {
    const w = this.world, { COLOR } = this.mods.draw, { TYPES } = this.mods.sim, esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const tips = { release: 'Take the selected organism away; the notes it holds go back to the graph', close: 'Take the whole overlay off the graph' };
    const btn = (a, label) => `<button data-act="${a}" style="margin:0 4px 4px 0"${tips[a] ? ` title="${tips[a]}"` : ''}>${label}</button>`, c = w.creatures.find(x => x.id === this.sel) ?? w.creatures.at(-1);
    const top = `<div style="opacity:.6;margin-bottom:4px">tick ${w.tick.toLocaleString()} · ×${this.speed}</div>
      <div>${btn('pause', this.paused ? 'Run' : 'Pause')}${btn('slower', '− 0.5')}${btn('faster', '+ 0.5')}${c ? btn('follow', this.following ? 'Stop following' : 'Follow') + btn('centre', 'Bring here') : ''}${c ? btn('release', 'Remove') : ''}${btn('close', 'Close')}</div>`;   // Remove takes away the selected one; Close takes the whole overlay off the graph
    if (!c) { setHtml(this.dyn, top + '<div style="opacity:.7;margin-top:6px">Nothing is out yet. Type what to look for above, pick a kind of organism, and send it out.</div>'); return; }
    const T = TYPES[c.type], title = i => esc(i.src === 'seed' ? `“${i.text}” (what it started from)` : i.src.split('/').pop());
    const note = i => i.src === 'seed' ? `<div style="opacity:.6">${title(i)}</div>` : `<div data-src="${esc(i.src)}" style="cursor:pointer;text-decoration:underline dotted">${title(i)}</div>`;
    const last = [...c.events].reverse().find(e => e.kind === 'taste');
    const said = !last ? 'Nothing tasted yet.' : last.brain ? `${last.fled ? 'Startled and fled from' : last.absorb ? 'Its feeding neuron fired, so it ate' : 'Not sweet enough, so it left'} ${title(last.idea)}`
      : `${last.absorb ? 'Took' : 'Passed over'} ${title(last.idea)} (fit ${last.score.toFixed(2)} against ${last.threshold < 0 ? 'room to spare' : last.threshold.toFixed(2)})`;
    const found = c.query ? this.finds(c) : null, state = x => x.done ? ' · done' : x.state === 'sleep' ? ' · asleep' : x.state === 'taste' ? ' · tasting' : '';
    const progress = c.query && !c.done ? `<div style="opacity:.6;margin-bottom:6px">${c.body.length} of ${c.cap} · holding together ${w.coherence(c).toFixed(2)} of ${COHERE} · ${Math.max(0, TIME_OUT - (w.tick - c.born)).toLocaleString()} ticks left</div>${btn('finish', 'Call it in now')}` : '';
    const done = c.done ? `<div style="margin:4px 0 6px;padding:6px 8px;border:1px solid ${COLOR[c.type]};border-radius:6px"><b>Finished:</b> ${esc(c.done.reason)}, after ${(c.done.tick - c.born).toLocaleString()} ticks.
        <div style="margin-top:6px">${btn('save', c.saved ? 'Saved' : 'Save as a note')}${btn('copy', 'Copy as text')}</div></div>` : '';
    setHtml(this.dyn, top + `<div style="margin:6px 0">${w.creatures.map(x => `<div data-c="${x.id}" style="cursor:pointer;padding:2px 6px;border-left:3px solid ${COLOR[x.type]};margin:2px 0;${x.id === c.id ? 'background:var(--background-modifier-hover,#333)' : ''}">
        #${x.id} ${x.query ? '“' + esc(x.query.slice(0, 22)) + '”' : TYPES[x.type].name} <span style="opacity:.6">· ${TYPES[x.type].name} · ${w.leaves(w.held(x)).length - 1} notes${state(x)}</span></div>`).join('')}</div>
      <div style="border-top:1px solid var(--background-modifier-border,#444);padding-top:6px"><b style="color:${COLOR[c.type]}">#${c.id} ${T.name}</b><div style="opacity:.75;margin:2px 0 6px">${esc(T.blurb)}</div>
        ${done}${c.done ? '' : `<div style="margin-bottom:6px">${said}</div>`}${progress}
        ${found ? `<div style="opacity:.6">looking for “${esc(c.query)}” · found ${found.length}, best fit first</div>${found.slice(0, 30).map(([v, i]) => note(i)).join('') || '<div style="opacity:.6">nothing yet</div>'}`
          : `<div style="opacity:.6">at its core</div>${c.core.map(note).join('')}
        <div style="opacity:.6;margin-top:6px">also holding (${c.body.length})</div>${c.body.slice(0, 14).map(note).join('') || '<div style="opacity:.6">nothing yet</div>'}`}</div>`);
  }
  // The graph keeps its pan and scale in device pixels; the overlay canvas has its own backing store of
  // CSS size x pixel ratio, so the two agree. `mode` is there in case Obsidian's convention differs.
  f() { const d = window.devicePixelRatio || 1; return [1 / d, 1, d][this.mode] * d; }   // graph pixels -> overlay canvas pixels
  px(gx, gy) { const f = this.f(); return [(gx * this.r.scale + this.r.panX) * f, (gy * this.r.scale + this.r.panY) * f]; }
  fromWorld(wx, wy) { const { W, H } = this.mods.sim; return this.px(this.cx + (wx - W / 2) / this.k, this.cy + (wy - H / 2) / this.k); }
  unit() { return this.r.scale / this.k * this.f(); }   // overlay pixels per world unit
  // Put every organism in the middle of what you are looking at (kept on the graph if you are looking past its edge).
  gather() {
    const { W, H } = this.mods.sim, f = this.f(), d = window.devicePixelRatio || 1, cs = this.world.creatures;
    const gx = (this.cv.clientWidth * d / 2 / f - this.r.panX) / this.r.scale, gy = (this.cv.clientHeight * d / 2 / f - this.r.panY) / this.r.scale;
    let wx = (gx - this.cx) * this.k, wy = (gy - this.cy) * this.k; const m = Math.hypot(wx, wy), lim = this.plate * 0.7;
    if (m > lim) { wx *= lim / m; wy *= lim / m; }
    const ring = Math.max(60, cs.reduce((n, c) => n + 2 * this.world.radius(c) + 10, 0) / (2 * Math.PI));
    cs.forEach((c, i) => { const a = i / cs.length * Math.PI * 2; c.x = W / 2 + wx + Math.cos(a) * ring; c.y = H / 2 + wy + Math.sin(a) * ring; c.target = null; c.heading = a; if (c.station) c.station = [c.x, c.y]; });   // one that has finished stays where it is put
  }
  tick(steps = null) {
    if (steps === null) { this.carry += this.speed; steps = Math.floor(this.carry); this.carry -= steps; }   // half speeds: a tick on some frames and not others
    // notes follow the graph as it settles or is dragged
    for (const { idea, node } of this.pins) idea.slot.free = [(node.x - this.cx) * this.k, (node.y - this.cy) * this.k];
    if (!this.paused) for (let i = 0; i < steps; i++) this.world.step();
    if (this.frame % 15 === 0) this.checkDone();
    if (this.following) this.follow();
    this.draw();
    if (++this.frame % 20 === 0 && !this.panel.matches(':hover')) this.fill();   // not while the pointer is on it, so a click lands on what was aimed at
  }
  draw() {
    const { world: w, cv, gc } = this, { drawCell, COLOR, rgba, THEME } = this.mods.draw, { TYPES } = this.mods.sim, dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cv.clientWidth * dpr), bh = Math.round(cv.clientHeight * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const g = cv.getContext('2d'), u = this.unit(), font = Math.max(10, 11 * dpr);
    g.clearRect(0, 0, cv.width, cv.height); g.textBaseline = 'middle';
    for (const c of w.creatures) {
      const [x, y] = this.fromWorld(c.x, c.y), col = COLOR[c.type];
      for (const i of w.leaves(w.held(c))) {   // what it has eaten: ringed where the graph keeps it, and tied to it
        const n = this.nodeOf.get(i); if (!n) continue;
        const [nx, ny] = this.px(n.x, n.y);
        g.strokeStyle = rgba(col, 0.28); g.lineWidth = dpr; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = col; g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(nx, ny, 5 * dpr, 0, 7); g.stroke();
      }
    }
    for (const c of w.creatures) { const [x, y] = this.fromWorld(c.x, c.y); drawCell(g, w, c, { x, y, R: w.radius(c) * u, font, chars: 14, selected: c.id === this.sel, plain: true, name: TYPES[c.type].name }); }
    g.font = `${font}px ${THEME.font}`; g.textAlign = 'left'; g.fillStyle = THEME.coreText;
    const held = w.creatures.reduce((n, c) => n + w.leaves(w.held(c)).length - 1, 0);
    g.fillText(`Spren · ${w.creatures.length} organisms on ${this.pins.length} notes · ${held} eaten · tick ${w.tick.toLocaleString()}`, 12 * dpr, cv.height - 14 * dpr);
  }
  start() { this.running = true; this.gather(); const loop = () => { if (!this.running) return; if (!this.cv.isConnected) return this.stop(); this.tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; this.cv.remove(); this.panel.remove(); }
}

class SprenPlugin extends Plugin {
  async onload() {
    this.addCommand({ id: 'overlay', name: 'Put organisms on the graph view (run again to remove them)', callback: () => this.toggleOverlay() });
    this.addCommand({ id: 'overlay-ratio', name: 'Overlay: fix position if the organisms are offset from the graph', callback: () => { if (this.overlay) { this.overlay.mode = (this.overlay.mode + 1) % 3; this.overlay.gather(); } } });
    this.addCommand({ id: 'overlay-follow', name: 'Overlay: zoom in and follow the selected organism (run again to stop)', callback: () => { if (this.overlay) { this.overlay.act('follow'); this.overlay.fill(); } } });
    this.addCommand({ id: 'overlay-centre', name: 'Overlay: bring the organisms to the middle of the view', callback: () => this.overlay?.gather() });
  }
  // Note text, read all at once rather than one file after another, and kept until the note changes.
  // (One at a time, each read waits its turn behind whatever else Obsidian is drawing, which with a
  // large graph view open is a lot; two thousand such waits is where the time went.)
  async texts(files) {
    const cache = this.textCache ??= new Map();
    return Promise.all(files.map(async f => {
      const hit = cache.get(f.path);
      if (hit && hit.mtime === f.stat.mtime) return hit.text;
      const text = await this.app.vault.cachedRead(f);
      cache.set(f.path, { mtime: f.stat.mtime, text });
      return text;
    }));
  }
  async toggleOverlay() {
    if (this.overlay) { this.overlay.stop(); this.overlay = null; return; }
    const ws = this.app.workspace, graphs = () => [...ws.getLeavesOfType('graph'), ...ws.getLeavesOfType('localgraph')];
    if (!graphs().length) { new Notice('Spren: open the graph view first, then run this again.'); return; }
    const leaf = graphs().find(l => l === ws.getMostRecentLeaf()) ?? graphs()[0], renderer = leaf?.view?.renderer, canvas = leaf?.view?.contentEl?.querySelector('canvas');
    if (!renderer?.nodes?.length || !canvas || typeof renderer.scale !== 'number') { new Notice('Spren: could not read the graph view (no nodes yet, or Obsidian changed how it works).'); return; }
    const t0 = performance.now(), files = renderer.nodes.map(n => this.app.vault.getAbstractFileByPath(n.id)).filter(f => f instanceof TFile && f.extension === 'md'), texts = await this.texts(files), t1 = performance.now();
    const notes = files.map((f, i) => ({ path: f.path, text: texts[i].slice(0, 2000), tags: (this.app.metadataCache.getFileCache(f)?.tags ?? []).map(t => t.tag.replace(/^#/, '').toLowerCase()) }));   // only the opening of each note is used here
    if (notes.length < 5) { new Notice('Spren: this graph shows too few notes to live on.'); return; }
    const mods = (this.mods ??= { sim, draw, circuit: JSON.parse(circuitText) }), t2 = performance.now();   // the fly brain is parsed the first time it is wanted
    this.overlay = new Overlay(renderer, canvas, notes, mods, mods.circuit);
    this.overlay.onOpen = src => this.app.workspace.openLinkText(String(src), '', 'tab');
    this.overlay.onClose = () => this.toggleOverlay();
    this.overlay.onDone = c => new Notice(`Spren: “${c.query}” is finished (${c.done.reason}). Its list is in the panel.`);
    // Saving is the one thing here that writes to the vault, and only when you press the button: one new note in a Spren folder.
    this.overlay.onSave = async (title, body) => {
      const dir = normalizePath('Spren'); if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      let path = normalizePath(`${dir}/${title}.md`); for (let k = 2; this.app.vault.getAbstractFileByPath(path); k++) path = normalizePath(`${dir}/${title} (${k}).md`);
      const file = await this.app.vault.create(path, body);
      await this.app.workspace.getLeaf('tab').openFile(file);
    };
    this.overlay.start();
    const sec = ms => (ms / 1000).toFixed(1) + ' s';
    new Notice(`Spren is on ${this.overlay.pins.length} notes. Ask it something in the panel; press Close there, or run the command again, to take it off.\nReading notes ${sec(t1 - t0)}, loading the simulation ${sec(t2 - t1)}, setting up ${sec(performance.now() - t2)}.`);
  }
  onunload() { this.overlay?.stop(); }
}


export default SprenPlugin;
export { Overlay, noteSoup };
export const engine = { sim, draw, circuitText };   // for the test page
