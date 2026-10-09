// Checks the plugin project before it is published. Exits non-zero if anything fails.
//   node test/validate.mjs
// 1. nothing private: no keys, tokens, personal paths, emails or vault names in any file that would be published
// 2. store rules: manifest, versions, licence, and the calls the Obsidian review rejects
// 3. the bundle: loads as Obsidian loads it, registers its commands, and holds no network or eval calls
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..'), fails = [], notes = [];
const fail = (what, detail = '') => fails.push(`${what}${detail ? ': ' + detail : ''}`);
const SKIP = new Set(['node_modules', '.git']);
const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } }; walk(root);
const rel = f => path.relative(root, f), read = f => fs.readFileSync(f, 'utf8');

// ---- 1. nothing private ----
const SECRETS = [
  ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an API key or token', /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gho_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/],
  ['a credential assignment', /\b(api[_-]?key|secret|passwd|password|bearer|authorization|access[_-]?token)\b\s*[:=]\s*['"][^'"]{6,}/i],
  ['a home directory path', /(\/Users\/|\/home\/|C:\\Users\\)[A-Za-z0-9._-]+/],
  ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['a phone number', /(?<![\d.])(\+?1[ -.])?\(?\d{3}\)?[ -.]\d{3}[ -.]\d{4}(?![\d.])/],
  ['a local network address', /\b(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):\d+/],
];
// Names that are private to whoever is publishing (a user name, a vault's name, other projects) are kept out of
// this repository: list them, one per line, in test/private-terms.local, which git ignores.
const LOCAL = path.join(root, 'test', 'private-terms.local');
if (fs.existsSync(LOCAL)) { const terms = read(LOCAL).split('\n').map(t => t.trim()).filter(t => t && !t.startsWith('#')); if (terms.length) SECRETS.push(['a name listed as private', new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')]); notes.push(`${terms.length} private names checked from test/private-terms.local`); }
else notes.push('no test/private-terms.local: private names were not checked');
const SELF = rel(import.meta.filename);
for (const f of files) {
  if (rel(f) === SELF || f === LOCAL) continue;   // this file names the patterns it looks for
  const text = read(f), lines = text.length > 3e6 ? [] : text.split('\n');
  for (const [what, re] of SECRETS) {
    const hit = lines.findIndex(l => l.length < 5000 && re.test(l));
    if (hit >= 0) fail(`${rel(f)} holds ${what}`, `line ${hit + 1}: ${lines[hit].trim().slice(0, 90)}`);
    else if (lines.length === 0 && re.test(text)) fail(`${rel(f)} holds ${what}`);
  }
}
// long lines (the embedded fly brain) are numbers only: make sure that is all they are
for (const f of files) for (const l of read(f).split('\n')) if (l.length >= 5000) {
  const words = (l.match(/[A-Za-z]{12,}/g) ?? []).filter(w => !/^(DNp|MN|loom|sugar|touch|source|params|outputs|inputs)/.test(w));
  for (const [what, re] of SECRETS.slice(0, 5)) if (re.test(l)) fail(`${rel(f)} holds ${what} in a long line`);
  if (new Set(words).size > 60) notes.push(`${rel(f)}: a long line with ${new Set(words).size} distinct long words; looked at for private text`);
}

// ---- 2. store rules ----
const manifest = JSON.parse(read(path.join(root, 'manifest.json'))), versions = JSON.parse(read(path.join(root, 'versions.json')));
if (!/^[a-z0-9-]+$/.test(manifest.id) || manifest.id.includes('obsidian')) fail('manifest id', manifest.id);
if (/obsidian|plugin/i.test(manifest.name)) fail('manifest name must not say Obsidian or plugin', manifest.name);
const data = JSON.parse(read(path.join(root, 'src/engine/fly_circuit.json')));
for (const k of Object.keys(data)) if (!['source', 'params', 'n', 'full_n', 'pre', 'post', 'w', 'inputs', 'outputs'].includes(k)) fail('the fly brain data carries a field it should not', k);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('manifest version is not x.y.z', manifest.version);
if (manifest.description.length > 250 || !/[.!?]$/.test(manifest.description) || /obsidian/i.test(manifest.description) || /^this /i.test(manifest.description)) fail('manifest description', `${manifest.description.length} chars`);
if (versions[manifest.version] !== manifest.minAppVersion) fail('versions.json does not map this version to minAppVersion');
for (const k of ['author', 'minAppVersion', 'isDesktopOnly']) if (manifest[k] === undefined) fail(`manifest lacks ${k}`);
for (const f of ['README.md', 'LICENSE', 'NOTICE.md', 'main.js']) if (!fs.existsSync(path.join(root, f))) fail(`missing ${f}`);
const REVIEW = [
  ['innerHTML / outerHTML / insertAdjacentHTML', /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(/],
  ['the global app (use this.app)', /(^|[^.\w$])app\.(vault|workspace|metadataCache)\b/],
  ['workspace.activeLeaf (deprecated)', /\.activeLeaf\b/],
  ['detaching leaves on unload', /detachLeavesOfType/],
  ['a hard-coded .obsidian folder', /['"`/]\.obsidian\b/],
  ['console.log', /console\.log\(/],
  ['an undocumented command call', /executeCommandById/],
];
const CODE = [
  ['a network call', /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)\b|require\(['"](https?|net|child_process|fs)['"]\)/],
  ['eval or a Function constructor', /\beval\s*\(|new\s+Function\s*\(/],
  ['a dynamic import', /\bimport\s*\(/],
  ['a remote URL', /https?:\/\/(?!www\.w3\.org)[^\s'"`)]+/],
  ['browser storage', /\b(localStorage|sessionStorage|indexedDB)\b/],
];
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => l.length < 5000).map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');   // code only: comments out, the data line out
for (const f of ['src/main.js', 'main.js']) { const code = strip(read(path.join(root, f))); for (const [what, re] of [...REVIEW, ...CODE]) { const m = code.match(re); if (m) fail(`${f} uses ${what}`, m[0].slice(0, 60)); } }
for (const f of ['src/engine/sim.js', 'src/engine/draw.js', 'src/engine/lif.js']) { const code = strip(read(path.join(root, f))); for (const [what, re] of CODE) { const m = code.match(re); if (m) fail(`${f} uses ${what}`, m[0].slice(0, 60)); } }
if (fs.statSync(path.join(root, 'main.js')).mtimeMs < fs.statSync(path.join(root, 'src/main.js')).mtimeMs) fail('main.js is older than src/main.js: run npm run build');

// ---- 3. the bundle, loaded the way Obsidian loads it ----
const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load, made = [];
Module._load = (name, ...a) => name === 'obsidian' ? { Plugin: class { addCommand(c) { made.push(c); } }, Notice: class {}, TFile: class {}, normalizePath: p => p, sanitizeHTMLToDom: undefined } : load(name, ...a);
try {
  const m = require(path.join(root, 'main.js')), P = m.default ?? m;
  if (typeof P !== 'function') fail('main.js does not export a plugin class');
  else { const p = new P(); await p.onload();
    if (!made.length) fail('the plugin registers no commands');
    for (const c of made) { if (!/^[a-z0-9-]+$/.test(c.id)) fail('command id', c.id); if (/spren/i.test(c.name)) fail('a command name repeats the plugin name', c.name); if (c.hotkeys) fail('a command sets a default hotkey', c.id); }
    p.onunload(); }
} catch (e) { fail('main.js does not load', e.message); }

const size = fs.statSync(path.join(root, 'main.js')).size;
console.log(`${files.length} files checked · manifest ${manifest.id} ${manifest.version} · main.js ${(size / 1e6).toFixed(1)} MB · ${made.length} commands`);
for (const n of notes) console.log('note:', n);
if (fails.length) { console.log(`\n${fails.length} PROBLEM${fails.length === 1 ? '' : 'S'}`); for (const f of fails) console.log(' -', f); process.exit(1); }
console.log('all checks pass');
