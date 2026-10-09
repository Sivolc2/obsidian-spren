// Drawing a creature as a cell: membrane, nucleus (core ideas), body ideas, and the mouth where an
// idea is tasted. Used small in the soup and large in the anatomy view. All sizes are in CSS pixels.
// Looks are themes: swap THEMES entries to fork the aesthetic without touching the drawing code.
import { TYPES, ROUND, TRADE_ROUNDS, NAP, short } from './sim.js';

const SANS = 'ui-sans-serif, system-ui, sans-serif', SERIF = 'Iowan Old Style, Palatino, Georgia, serif';
export const THEMES = {
  deep: { label: 'Deep field', note: 'Dark-field microscope: thin luminous lines on blue-black.',
    bg: '#0b0e14', bg2: '#101624', panel: '#121722', ink: '#d7dce6', dim: '#7c8598', line: '#232a3a', accent: '#8fd3ff',
    good: '#7ee0a1', bad: '#ff8f8f', fed: '#ffb86b', coreText: '#ffffff', font: SANS, glow: 0, fill: 0.1, wall: 1.6, texture: 'none',
    types: { matcher: '#9aa4b8', forager: '#8fd3ff', empath: '#ff9ecb', keeper: '#f2c879', learner: '#c9a0ff', forest: '#9fe07e', fly: '#ff9e7a', seer: '#f5f0b0', llm: '#7ee0c8', tree: '#c9a66b', frog: '#b6f23c' } },
  vellum: { label: 'Vellum', note: "Naturalist's plate: ink and pigment on warm paper, serif captions.",
    bg: '#efe6d2', bg2: '#f6efdf', panel: '#e7dcc4', ink: '#2c2418', dim: '#7d6f58', line: '#cdbf9f', accent: '#8a3b1c',
    good: '#3f7a4a', bad: '#a8321f', fed: '#b0661a', coreText: '#1a140c', font: SERIF, glow: 0, fill: 0.16, wall: 1.3, texture: 'grain',
    types: { matcher: '#6b6253', forager: '#2f5f8a', empath: '#a23a6a', keeper: '#9a6a12', learner: '#6a3f86', forest: '#3d6f3a', fly: '#a5412a', seer: '#7a6a00', llm: '#1f6f66', tree: '#7a5a2e', frog: '#55780f' } },
  storm: { label: 'Stormlight', note: 'Gemstone light in a dark sky: saturated colour, strong glow, each cell lit from within.',
    bg: '#07060f', bg2: '#15102a', panel: '#0f0c1c', ink: '#e9e4ff', dim: '#8a80ad', line: '#2a2346', accent: '#7fe6ff',
    good: '#6dffb0', bad: '#ff6f91', fed: '#ffc857', coreText: '#ffffff', font: SANS, glow: 14, fill: 0.2, wall: 2, texture: 'specks',
    types: { matcher: '#a9b4d6', forager: '#57c7ff', empath: '#ff7ac8', keeper: '#ffd166', learner: '#c58bff', forest: '#7dff8a', fly: '#ff7a59', seer: '#fff29e', llm: '#4dffd8', tree: '#e6b672', frog: '#c8ff3d' } },
};
export const THEME = { name: 'deep', ...THEMES.deep };
export const COLOR = { ...THEMES.deep.types };
export function setTheme(name) {
  if (!THEMES[name]) name = 'deep';
  Object.assign(THEME, THEMES[name], { name }); Object.assign(COLOR, THEMES[name].types);
}

export const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const fontOf = (px, bold) => `${bold ? '600 ' : ''}${px}px ${THEME.font}`;

export function paintBackground(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, THEME.bg2); g.addColorStop(1, THEME.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (THEME.texture === 'none') return;
  ctx.fillStyle = rgba(THEME.ink, THEME.texture === 'grain' ? 0.05 : 0.35);
  for (let i = 0; i < 260; i++) {   // fixed pseudo-random specks, so they do not shimmer
    const x = (i * 7919 % 1000) / 1000 * w, y = (i * 104729 % 1000) / 1000 * h;
    ctx.fillRect(x, y, THEME.texture === 'grain' ? 2 : 1, 1);
  }
}

// Body ideas sit on one ring in a small cell, two or three in a large one, with a smaller nucleus.
export const rings = c => { const n = Math.max(c.cap, c.body.length); return n <= 9 ? 1 : n <= 18 ? 2 : 3; };
export const nucleus = c => rings(c) > 1 ? 0.3 : 0.42;
export const bodyPos = (c, i, R, t) => {
  const k = rings(c), n = Math.max(c.cap, c.body.length), per = Math.ceil(n / k), ring = i % k, r = k === 1 ? 0.7 : 0.45 + ring * (k === 2 ? 0.3 : 0.2);
  const a = (Math.floor(i / k) + ring / k) / per * Math.PI * 2 + t * 0.0012 * (ring % 2 ? -1 : 1) + c.id;
  return [Math.cos(a) * R * r, Math.sin(a) * R * r];
};
export const corePos = (c, i, R, font) => [0, (i - (c.core.length - 1) / 2) * (font + 9)];

function wrapText(text, per, max) {
  const lines = [''];
  for (const w of text.split(' ')) {
    const last = lines.length - 1;
    if (!lines[last] || (lines[last] + ' ' + w).length <= per) lines[last] += (lines[last] ? ' ' : '') + w;
    else if (lines.length < max) lines.push(w);
    else { lines[last] = short(lines[last] + ' ' + w, per); break; }
  }
  return lines.map(l => short(l, per + 2));
}
const label = (ctx, text, x, y, per, max, font) => wrapText(text, per, max).forEach((l, k) => ctx.fillText(l, x, y + k * (font + 1)));

// Body plans. The simple creatures are organic; from the Keeper up, each step in complexity is a
// polygon with more sides (TYPES[k].sides: 4, 6, 8, 10, 12, 16), with a bead on every corner so the
// count can be read at a glance.
//   matcher  an amoeba: lumpy shifting outline, no true nucleus
//   forager  a ciliate: smooth wall fringed with sensing hairs
//   empath   a bloom: six slow petals
//   keeper   4 sides, a crystal        learner  6, a neuron with dendrites and a web
//   forest   8, branches inside        fly     10, with head, wings and legs
//   seer    12, an eye                 llm     16, a library
const poly = (a, n, R, turn = 0) => { const seg = 2 * Math.PI / n, m = (((a - turn) % seg) + seg) % seg; return R * Math.cos(seg / 2) / Math.cos(m - seg / 2); };
const turnOf = c => TYPES[c.type].sides === 4 ? Math.PI / 4 : -Math.PI / 2;
const cornerR = (c, R) => R * 0.9 / Math.cos(Math.PI / TYPES[c.type].sides);
export function edge(c, a, R, t) {
  const n = TYPES[c.type].sides;
  if (n) return poly(a, n, cornerR(c, R), turnOf(c));
  switch (c.type) {
    case 'matcher': return R * (0.9 + 0.1 * Math.sin(2 * a + t * 0.011 + c.id) + 0.07 * Math.sin(3 * a - t * 0.014 + 2 * c.id) + 0.035 * Math.sin(5 * a + t * 0.02));
    case 'empath': return R * (0.94 + 0.09 * Math.sin(6 * a + c.id) * (0.7 + 0.3 * Math.sin(t * 0.04)));
    default: return R * (1 + 0.02 * Math.sin(3 * a + t * 0.02 + c.id));
  }
}
function outline(ctx, c, R, t, k = 1) {
  const n = TYPES[c.type].sides;
  ctx.beginPath();
  if (n) for (let i = 0; i < n; i++) { const a = turnOf(c) + i * 2 * Math.PI / n, r = cornerR(c, R) * k; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  else for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, r = edge(c, a, R, t) * k; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
}
// the colour of the continent an idea comes from
export const homeColor = (world, idea, alpha = 1) => { const L = world.lands?.[idea.home]; return L?.color ? rgba(L.color, alpha) : L ? `hsla(${L.hue} ${THEME.name === 'vellum' ? '55% 36%' : '75% 70%'} / ${alpha})` : rgba(THEME.ink, alpha * 0.9); };

// the fly's appendages, drawn behind the body, facing the way it is heading
// A frog: two eyes on top, facing the way it is going, and folded back legs that stretch when it hops.
function frogParts(ctx, c, R, t, col) {
  ctx.save(); ctx.rotate(c.heading);
  const hop = c.dash > 0 ? 1 : 0;
  ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = Math.max(1.2, R * 0.06); ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(-R * 0.55, side * R * 0.7); ctx.lineTo(-R * (0.75 + 0.5 * hop), side * R * (1.25 - 0.2 * hop)); ctx.lineTo(-R * (0.35 + 1.1 * hop), side * R * (1.3 - 0.3 * hop)); ctx.stroke();
    ctx.beginPath(); ctx.arc(R * 0.72, side * R * 0.5, R * 0.26, 0, 7); ctx.fillStyle = rgba(col, 0.9); ctx.fill();
    ctx.beginPath(); ctx.arc(R * 0.8, side * R * 0.5, R * 0.11, 0, 7); ctx.fillStyle = THEME.bg; ctx.fill();
  }
  ctx.restore();
}
function flyParts(ctx, world, c, R, t, col) {
  const h = c.job?.angle ?? c.heading, tasting = c.state === 'taste';
  ctx.save(); ctx.rotate(h);
  ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    for (const [x, reach] of [[0.45, 0.5], [0, 0.6], [-0.45, 0.55]]) {   // legs
      const step = Math.sin(t * 0.25 * c.pace + x * 6 + side) * 0.12 * (tasting ? 0 : 1);
      ctx.beginPath(); ctx.moveTo(R * x, side * R * 0.8); ctx.lineTo(R * (x + step), side * R * (1.15 + reach * 0.4)); ctx.lineTo(R * (x + step - 0.15), side * R * (1.3 + reach * 0.5)); ctx.stroke();
    }
    ctx.save();   // wings, swept back; they buzz while it runs
    ctx.rotate(side * (0.5 + (c.dash > 0 ? Math.sin(t * 2) * 0.35 : 0)));
    ctx.beginPath(); ctx.ellipse(-R * 1.0, side * R * 0.15, R * 0.95, R * 0.34, 0, 0, 7);
    ctx.fillStyle = rgba(THEME.ink, 0.1); ctx.fill(); ctx.strokeStyle = rgba(col, 0.6); ctx.stroke();
    ctx.restore();
  }
  // head and eyes
  ctx.beginPath(); ctx.arc(R * 1.18, 0, R * 0.36, 0, 7); ctx.fillStyle = rgba(col, 0.25); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(R * 1.3, side * R * 0.2, R * 0.15, R * 0.2, 0, 0, 7); ctx.fillStyle = THEME.bad; ctx.fill(); }
  // the brain: every neuron that just spiked, at its real position in the fly brain
  const f = c.job?.flashes, pos = world.circuit?.pos;
  if (f && pos) {
    const b = world.circuit.box ??= (() => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]); } return { x0, x1, y0, y1 }; })();
    ctx.fillStyle = THEME.fed;
    for (let i = 0; i < f.length; i++) if (f[i] > 0.2) {
      const u = (pos[i * 3] - b.x0) / (b.x1 - b.x0) - 0.5, v = (pos[i * 3 + 1] - b.y0) / (b.y1 - b.y0) - 0.5;
      ctx.globalAlpha = f[i]; ctx.fillRect(R * 1.18 + v * R * 0.5, u * R * 0.62, Math.max(1, R * 0.012), Math.max(1, R * 0.012));
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// o: { x, y, R, font, chars, selected, dim }
export function drawCell(ctx, world, c, o) {
  // while asleep everything inside holds still: the body stops turning and the outline stops shifting
  const { x, y, R, font, chars } = o, now = world.tick, t = c.state === 'sleep' ? c.nap?.start ?? now : now, col = COLOR[c.type], job = c.job;
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = o.dim ? 0.55 : 1;
  ctx.font = fontOf(font); ctx.textBaseline = 'middle';
  const asleep = c.state === 'sleep', wall = THEME.wall + (o.selected ? 1.6 : 0);
  // creatures are small against the sky; their insides are only written out when there is room
  const fine = !o.plain && R >= 110, words = fine || o.selected;
  const unit = R / world.radius(c);   // screen pixels per world unit, so held ideas keep their star size

  if (THEME.glow) {   // lit from within
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.5);
    g.addColorStop(0, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, 7); ctx.fill();
  }
  if (o.selected) {   // unmistakable: a bright rotating halo and a name tag
    ctx.strokeStyle = THEME.coreText; ctx.lineWidth = 2; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now * 0.4;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.22 + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  if (c.type === 'fly') flyParts(ctx, world, c, R, t, col);
  if (c.type === 'frog') frogParts(ctx, c, R, t, col);
  if (c.life) {   // how much of this life is left, as an arc that runs down
    const left = Math.max(0, 1 - (now - c.born) / c.life), rr = R * (c.type === 'fly' ? 1.62 : 1.13) + 3;
    ctx.strokeStyle = rgba(col, 0.18); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.stroke();
    ctx.strokeStyle = left < 0.12 ? THEME.bad : rgba(col, 0.85); ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
  }
  if (c.lives > 1 && now - c.born < 160) {   // just reborn
    const q = (now - c.born) / 160;
    ctx.strokeStyle = rgba(THEME.coreText, 1 - q); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * (0.3 + q * 1.6), 0, 7); ctx.stroke();
  }

  // membrane
  ctx.shadowColor = col; ctx.shadowBlur = THEME.glow;
  outline(ctx, c, R, t);
  ctx.fillStyle = rgba(col, c.type === 'tree' ? THEME.fill / 3 : asleep ? THEME.fill / 2 : THEME.fill); ctx.fill();
  const sides = TYPES[c.type].sides;
  ctx.strokeStyle = col; ctx.lineWidth = sides ? wall + 0.6 + sides / 16 : wall;
  ctx.setLineDash(asleep ? [5, 4] : c.type === 'matcher' ? [1.5, 3] : c.type === 'tree' ? [2, 7] : []);   // a tree has no wall, only the reach of its canopy
  ctx.lineJoin = sides ? 'miter' : 'round';
  ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  if (sides) {   // a bead on every corner
    ctx.fillStyle = col;
    for (let i = 0; i < sides; i++) { const a = turnOf(c) + i * 2 * Math.PI / sides, r = cornerR(c, R); ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(2, R * 0.035), 0, 7); ctx.fill(); }
  }
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(col, 0.55);
  ctx.beginPath();
  if (c.type === 'forager') {
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2, r = edge(c, a, R, t), sway = a + 0.12 * Math.sin(t * 0.05 + i);
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(sway) * (r + R * 0.1), Math.sin(sway) * (r + R * 0.1));
    }
  } else if (c.type === 'empath') {   // a vein down each petal
    for (let i = 0; i < 6; i++) { const a = (i + 0.25) * Math.PI / 3 - c.id / 6; ctx.moveTo(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45); ctx.lineTo(Math.cos(a) * edge(c, a, R, t) * 0.96, Math.sin(a) * edge(c, a, R, t) * 0.96); }
  } else if (c.type === 'seer') {     // fine rays, like an iris
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ctx.moveTo(Math.cos(a) * R * 0.46, Math.sin(a) * R * 0.46); ctx.lineTo(Math.cos(a) * R * (i % 4 ? 0.56 : 0.66), Math.sin(a) * R * (i % 4 ? 0.56 : 0.66)); }
  } else if (c.type === 'keeper') {   // facets
    for (let i = 0; i < 4; i++) { const a = turnOf(c) + i * Math.PI / 2; ctx.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); ctx.lineTo(Math.cos(a) * cornerR(c, R), Math.sin(a) * cornerR(c, R)); }
  } else if (c.type === 'learner') {
    for (let i = 0; i < 6; i++) {   // a dendrite from every corner
      const a = turnOf(c) + i * Math.PI / 3, r = cornerR(c, R), tip = r + R * 0.13;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * tip, Math.sin(a) * tip);
      for (const d of [-0.11, 0.11]) { ctx.moveTo(Math.cos(a) * tip, Math.sin(a) * tip); ctx.lineTo(Math.cos(a + d) * (tip + R * 0.08), Math.sin(a + d) * (tip + R * 0.08)); }
    }
    c.body.forEach((_, i) => { const [bx, by] = bodyPos(c, i, R, t), n = Math.hypot(bx, by); ctx.moveTo(bx / n * R * nucleus(c), by / n * R * nucleus(c)); ctx.lineTo(bx, by); });
  } else if (c.type === 'tree') {     // a thick branch from the trunk to every idea, with twigs
    ctx.stroke(); ctx.beginPath(); ctx.lineWidth = Math.max(1.6, R * 0.035); ctx.lineCap = 'round';
    c.body.forEach((_, i) => {
      const [bx, by] = bodyPos(c, i, R, t), n = Math.hypot(bx, by), ux = bx / n, uy = by / n, m = n * 0.6;
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(ux * m - uy * R * 0.12, uy * m + ux * R * 0.12, bx, by);
      for (const sd of [-1, 1]) { ctx.moveTo(ux * m, uy * m); ctx.lineTo(ux * (m + R * 0.12) - uy * sd * R * 0.1, uy * (m + R * 0.12) + ux * sd * R * 0.1); }
    });
  } else if (c.type === 'forest') {   // a trunk to each idea, forking on the way
    c.body.forEach((_, i) => {
      const [bx, by] = bodyPos(c, i, R, t), n = Math.hypot(bx, by), ux = bx / n, uy = by / n, m = R * 0.56;
      ctx.moveTo(ux * R * 0.3, uy * R * 0.3); ctx.lineTo(bx, by);
      for (const s of [-1, 1]) { ctx.moveTo(ux * m, uy * m); ctx.lineTo(ux * (m + R * 0.14) - uy * s * R * 0.1, uy * (m + R * 0.14) + ux * s * R * 0.1); }
    });
  } else if (c.type === 'llm') {      // book spines along the inside of the wall
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = edge(c, a, R, t); ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); }
  }
  ctx.stroke();
  if (c.type === 'learner') { outline(ctx, c, R, t, 0.93); ctx.stroke(); }

  // what the job is comparing against, revealed one at a time
  const tasting = job?.kind === 'taste', p = tasting ? 1 - c.timer / job.total : 0;
  const mouthR = tasting ? edge(c, job.angle, R, t) * (c.type === 'fly' ? 1.5 : 1) : R;
  const mouth = tasting ? [Math.cos(job.angle) * mouthR, Math.sin(job.angle) * mouthR] : null;
  const shown = new Map();
  if (job?.comps && !job.llm) job.comps.forEach((q, k) => { if (p > (k + 1) / (job.comps.length + 3)) shown.set(q.idea, q); });

  c.body.forEach((idea, i) => {
    const [bx, by] = bodyPos(c, i, R, t), q = shown.get(idea), leaving = job?.expel === idea && p > 0.55 && !job.pending;
    if (leaving) { ctx.strokeStyle = THEME.bad; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, font * (0.8 + 0.35 * Math.sin(t * 0.35)), 0, 7); ctx.stroke(); }
    if (q && mouth) link(ctx, mouth, [bx, by], q, fine ? font : 0);
    if (idea.pod) drawPod(ctx, idea, bx, by, idea.size * unit, 1);
    else {
      ctx.fillStyle = leaving ? THEME.bad : idea.block ? THEME.fed : homeColor(world, idea);
      ctx.beginPath(); ctx.arc(bx, by, Math.max(1.6, idea.size * unit), 0, Math.PI * 2); ctx.fill();   // the same size it was as a star
    }
    ctx.fillStyle = leaving ? THEME.bad : idea.pod ? COLOR[idea.maker] : rgba(THEME.ink, 0.62);
    ctx.textAlign = 'center';
    if (fine) label(ctx, idea.pod ? idea.label : idea.text, bx, by + idea.size * unit + font * 0.7, chars, 2, font);
  });

  // nucleus with the core ideas
  if (c.type === 'keeper' || c.type === 'llm' || c.type === 'seer') {
    for (const [k, w] of [[nucleus(c) * 1.12, 2.5], [nucleus(c) * 0.95, 1]]) { outline(ctx, c, R, t, k); if (w > 1) { ctx.fillStyle = rgba(col, THEME.fill * 2); ctx.fill(); } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
    if (c.type === 'llm') { ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1; ctx.beginPath(); for (const k of [-0.2, 0, 0.2]) { ctx.moveTo(-R * 0.36, R * k + font * 0.75); ctx.lineTo(R * 0.36, R * k + font * 0.75); } ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(0, 0, R * nucleus(c), 0, Math.PI * 2);
    ctx.fillStyle = rgba(col, c.type === 'matcher' ? THEME.fill * 0.7 : THEME.fill * 2); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1;
    ctx.setLineDash(c.type === 'matcher' ? [1, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    if (c.type === 'learner') for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + t * 0.004;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(Math.cos(a) * R * nucleus(c), Math.sin(a) * R * nucleus(c), Math.max(1.3, R * 0.015), 0, 7); ctx.fill();
    }
  }
  ctx.textAlign = 'center';
  c.core.forEach((idea, i) => {
    const [cx, cy] = corePos(c, i, R, font), q = shown.get(idea);
    if (q && mouth) link(ctx, mouth, [cx, cy], q, fine ? font : 0);
    if (!words) { ctx.fillStyle = THEME.coreText; ctx.beginPath(); ctx.arc(cx, cy * 0.5, Math.max(1.5, R * 0.07), 0, 7); ctx.fill(); return; }
    // each core idea sits on its own plaque, wider than the nucleus, so the axioms read first
    ctx.font = fontOf(font + 1, true);
    const text = short(idea.pod ? '⬡ ' + idea.label : idea.text, Math.round(Math.max(R, 70) * 1.55 / ((font + 1) * 0.52))), tw = ctx.measureText(text).width + 12, th = font + 7;
    ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, 4);
    const risen = asleep && c.nap?.promoted === idea;   // the idea that entered the nucleus this sleep
    ctx.fillStyle = rgba(THEME.bg, 0.88); ctx.fill(); ctx.strokeStyle = risen ? THEME.fed : col; ctx.lineWidth = risen ? 2.6 : 1.3; ctx.stroke();
    ctx.fillStyle = THEME.coreText; ctx.fillText(text, cx, cy + 0.5);
  });
  ctx.font = fontOf(font);

  // name tag
  ctx.fillStyle = o.selected ? THEME.coreText : rgba(col, 0.9); ctx.font = fontOf(o.selected ? font + 2 : font, o.selected);
  ctx.fillText(o.selected ? `▸ #${c.id} ${o.name} ◂` : `#${c.id}`, 0, R * (c.type === 'fly' ? 1.75 : 1.2) + font + (o.selected ? 8 : 2));
  ctx.font = fontOf(font);

  if (tasting) {
    const [mx, my] = mouth, out = [Math.cos(job.angle), Math.sin(job.angle)];
    ctx.strokeStyle = THEME.coreText; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, job.idea.size * unit + 4, -Math.PI / 2, -Math.PI / 2 + (job.pending ? (t * 0.08) % 6.3 : p * Math.PI * 2)); ctx.stroke();
    ctx.fillStyle = job.idea.block ? THEME.fed : THEME.coreText;
    ctx.beginPath(); ctx.arc(mx, my, Math.max(1.6, job.idea.size * unit), 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = out[0] >= 0 ? 'left' : 'right';
    if (words) ctx.fillText(short(job.idea.text, chars + 14), mx + out[0] * (job.idea.size * unit + font), my + out[1] * (job.idea.size * unit + font));
    (job.cues || []).forEach((q, k) => {   // learned tastes show the cues they recognise
      if (!fine || p < (k + 1) / (job.cues.length + 3)) return;
      ctx.fillStyle = q.w > 0 ? THEME.good : THEME.bad; ctx.textAlign = 'center';
      const a = job.angle + (k - (job.cues.length - 1) / 2) * 0.42;
      ctx.fillText(`${q.w > 0 ? '+' : '−'}${q.cue}`, Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55);
    });
    ctx.textAlign = 'center';
    if (job.brain && words) { ctx.fillStyle = THEME.fed; ctx.fillText(`sugar ${Math.round(job.sugar * 170)} Hz${job.loom > 0.05 ? ' · looming!' : ''} · MN9 ×${job.mn9}`, 0, -R * 1.2 - font * 2.6); }
    if (job.pending) { ctx.fillStyle = COLOR.llm; ctx.fillText('reading' + '.'.repeat(1 + Math.floor(t / 12) % 3), 0, -R - font * 1.2); }
    else if (p > 0.8) verdict(ctx, job, R, font, 1);
  } else if (asleep) {
    sleeping(ctx, c, R, font, now, col);
  } else {
    const e = c.events.at(-1);
    if (e?.kind === 'taste' && t - e.tick < 90) verdict(ctx, e, R, font, 1 - (t - e.tick) / 90);
  }
  ctx.restore();
}

// Asleep: the cell dims under a veil and breathes slowly, a moon hangs over it, and its body ideas
// are drawn in toward the nucleus. If an idea was promoted this sleep, it travels in from the rim and
// its plaque is ringed in gold; the one it displaced travels back out.
function sleeping(ctx, c, R, font, t, col) {
  const q = Math.min(1, (t - (c.nap?.start ?? t)) / NAP), breath = 0.5 + 0.5 * Math.sin(t * 0.05), top = -R * (c.type === 'fly' ? 1.7 : 1.2);
  ctx.fillStyle = rgba(THEME.bg, 0.42); ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.25 + 0.35 * breath); ctx.lineWidth = 2 + 3 * breath; ctx.beginPath(); ctx.arc(0, 0, R * (1.05 + 0.04 * breath), 0, 7); ctx.stroke();
  ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.lineDashOffset = t * 0.5;   // ideas drawn inward
  ctx.beginPath(); c.body.forEach((_, i) => { const [bx, by] = bodyPos(c, i, R, c.nap?.start ?? t); ctx.moveTo(bx, by); ctx.lineTo(bx * 0.55, by * 0.55); }); ctx.stroke(); ctx.setLineDash([]);
  const mx = 0, my = top - font * 2.2, mr = font * 0.95;   // crescent moon
  ctx.fillStyle = THEME.fed; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
  ctx.fillStyle = THEME.bg; ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(THEME.ink, 0.85); ctx.textAlign = 'left';
  for (let k = 0; k < 3; k++) { const u = ((t * 0.012 + k / 3) % 1); ctx.globalAlpha *= 1; ctx.font = fontOf(font + k * 2, true); ctx.fillStyle = rgba(THEME.ink, 0.9 * (1 - u)); ctx.fillText('z', mx + mr * 1.5 + u * 16 + k * 3, my - u * 22); }
  ctx.font = fontOf(font); ctx.textAlign = 'center'; ctx.fillStyle = rgba(THEME.ink, 0.9);
  ctx.fillText(`asleep · ${c.nap?.doing ?? ''}`, 0, top - font * 0.4);
  if (c.nap?.promoted) {
    const i = c.core.indexOf(c.nap.promoted), [, cy] = corePos(c, Math.max(0, i), R, font), a = c.id * 2.4, e = q * q * (3 - 2 * q);
    const x = Math.cos(a) * R * 0.7 * (1 - e), y = Math.sin(a) * R * 0.7 * (1 - e) + cy * e;
    ctx.strokeStyle = THEME.fed; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = THEME.fed; ctx.beginPath(); ctx.arc(x, y, font * 0.5, 0, 7); ctx.fill();
    ctx.fillText(q < 0.95 ? 'a new core idea rises' : 'core changed', 0, R * 0.62);
  }
}

function link(ctx, from, to, q, font) {
  ctx.strokeStyle = q.counted ? rgba(THEME.good, Math.min(1, 0.15 + q.v * 4)) : rgba(THEME.dim, 0.25);
  ctx.lineWidth = q.counted ? 0.6 + q.v * 10 : 0.6;
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
  if (font && q.counted && q.v >= 0.01) {
    ctx.fillStyle = THEME.good; ctx.textAlign = 'center';
    ctx.fillText(q.v.toFixed(2), (from[0] + to[0] * 2) / 3, (from[1] + to[1] * 2) / 3 - font * 0.7);
  }
}

// A pod: what a creature leaves behind. A ring in its maker's colour, one seed for every idea
// inside, and an inner ring for each level of pods packed within it.
export function drawPod(ctx, pod, x, y, r, alpha) {
  const col = COLOR[pod.maker] ?? THEME.ink, n = pod.parts.length;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = rgba(col, 0.18); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); ctx.stroke();
  for (let d = 1; d < pod.depth; d++) { ctx.beginPath(); ctx.arc(x, y, r * (1 - d * 0.28), 0, 7); ctx.stroke(); }
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, Math.max(1, r * 0.11), 0, 7); ctx.fill(); }
  ctx.restore();
}

export function verdictText(j) {
  const word = j.fled ? 'fled' : j.absorb ? 'absorb' : 'pass';
  if (j.brain) return `${word}  MN9 fired ×${j.mn9}${j.fled ? ', Giant Fiber fired' : ''}`;
  if (j.llm) return `${word}  “${j.llm.why}”`;
  const bar = j.threshold < 0 ? 'has room' : `bar ${j.threshold.toFixed(2)}`;
  return `${word}  ${j.score.toFixed(2)} ${j.absorb ? '>' : '≤'} ${bar}`;
}
function verdict(ctx, j, R, font, alpha) {
  const before = ctx.globalAlpha;
  ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.font = fontOf(font + 1, true);
  ctx.fillStyle = j.fled ? THEME.bad : j.absorb ? THEME.good : THEME.dim;
  ctx.fillText(verdictText(j), 0, -R * 1.2 - font * 1.2);
  ctx.globalAlpha = before;
}

// Two cells trading. A bridge joins them; each offered idea waits on its own side while the pair
// compare, then the two cross over. Pips show which exchange of the meeting this is.
export function drawTrade(ctx, world, a, pa, pb, Ra, Rb, font) {
  const j = a.job, b = j.partner, p = 1 - a.timer / (j.gives ? ROUND : ROUND / 2);
  const dx = pb[0] - pa[0], dy = pb[1] - pa[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const A = [pa[0] + ux * Ra * 0.75, pa[1] + uy * Ra * 0.75], B = [pb[0] - ux * Rb * 0.75, pb[1] - uy * Rb * 0.75];
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], nx = -uy, ny = ux;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(THEME.ink, 0.1 + 0.05 * Math.sin(world.tick * 0.15)); ctx.lineWidth = 26;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  ctx.strokeStyle = rgba(THEME.ink, 0.5); ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -world.tick * 0.3;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = fontOf(font, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k < TRADE_ROUNDS; k++) {
    ctx.fillStyle = k < j.round - 1 ? THEME.good : k === j.round - 1 ? THEME.coreText : rgba(THEME.ink, 0.25);
    ctx.beginPath(); ctx.arc(mid[0] + (k - (TRADE_ROUNDS - 1) / 2) * 11, mid[1], 3.5, 0, 7); ctx.fill();
  }
  if (!j.gives) {
    ctx.fillStyle = THEME.dim;
    ctx.fillText(j.round === 1 ? (p > 0.5 ? 'no swap helps both' : 'comparing…') : 'nothing more to trade', mid[0], mid[1] - 26);
  } else {
    const q = Math.max(0, (p - 0.4) / 0.6), e = q * q * (3 - 2 * q), lift = Math.sin(e * Math.PI) * 26;
    const at = (from, to, side) => [from[0] + (to[0] - from[0]) * e + nx * (16 + lift) * side, from[1] + (to[1] - from[1]) * e + ny * (16 + lift) * side];
    for (const [idea, from, to, side, owner, gain] of [[j.gives, A, B, 1, a, j.theirGain], [j.gets, B, A, -1, b, j.gain]]) {
      const [x, y] = at(from, to, side), col = COLOR[owner.type];
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
      ctx.strokeStyle = THEME.coreText; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 8 + 2 * Math.sin(world.tick * 0.2), 0, 7); ctx.stroke();
      ctx.fillStyle = THEME.coreText; ctx.fillText(short(idea.text, 40), x + nx * side * 16, y + ny * side * 16 + side * 2);
      ctx.fillStyle = THEME.good; ctx.font = fontOf(font);
      ctx.fillText(q === 0 ? `worth +${gain.toFixed(2)} to #${owner === a ? b.id : a.id}` : '', x + nx * side * 16, y + ny * side * 16 + side * (font + 5));
      ctx.font = fontOf(font, true);
    }
    ctx.fillStyle = THEME.coreText; ctx.fillText(p < 0.4 ? `exchange ${j.round}: comparing…` : `exchange ${j.round}`, mid[0], mid[1] - 14);
  }
  ctx.restore();
}
