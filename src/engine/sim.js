import { LIF } from './lif.js';

// Spren: idea organisms in a memetic soup.
// The unit of food is an idea: a sentence, a saying, sometimes a single word. Ideas are conserved:
// each is either drifting in the soup or held by exactly one creature.
// A creature is a cell with two layers: a nucleus of 3 core ideas (changes only at sleep) and a body
// of 8 ideas (changes whenever something fits better). Slots are the only scarcity. No energy, no death.

export const W = 2600, H = 1560, PLATE = 470;   // PLATE: default radius of the round dish the dish and scattered maps live on
// Every creature has three core slots. Body size depends on the template (TYPES[k].slots is
// [what it starts with, what it can grow to]): simple creatures hold 3 to 6 ideas and stay that
// size; the learned and prompted ones hold 10 to 30. Those grow by one slot each time they absorb
// a pod, and a creature that does not die also grows by one at every second sleep.
export const CORE_SLOTS = 3;
export const EATING = 150;   // ticks an organism spends swallowing another
export const ROUND = 200, TRADE_ROUNDS = 3, NAP = 180, SLEEP = 1500, REACH = 150;
// Terrain: four continents in a band around the globe, with open sea between them wider than most
// creatures can sense across, and one small island (the Inlet) where fed ideas arrive.
const LANDS = [[300, 440], [850, 860], [1400, 440], [1950, 860]], LAND_R = 215, INLET = [1125, 150], INLET_R = 80;
const LAND_SPEED = 0.07, LAND_GAP = 150;   // continents drift; they keep at least this much sea between them
export const SHELF = 6000;   // how long an uneaten pod lasts before it dissolves back into the soup
const DRIFT_EVERY = 6, HOMING = 0.02, CROWD = 62, KIN_PULLS = 5, PULL = 0.0048, PUSH = 0.06, KIN_CAP = 2048;
const ECO_LIFE = 16000, ECO_CAP = 30, BUD_REST = 2000, MUTATE = 0.3, EAT_RATIO = 1.3, HUNT_RANGE = 260, SAFE_YOUNG = 800, DIGEST = 1500, FLOOR = 6, DIGEST_TREE = 4000, COMMIT = 500, WEB_GROW = 60, WEB_REACH = 150, WEB_SNAP = 420, WEB_BAR = 0.02, WEB_MAX = 60, BITE = 3, MAX_FROGS = 3, MAX_TREES = 8;
const BODY = 3.6, DASH_SPEED = 4, DASH_LENGTHS = 5;   // a fleeing fly moves at four times its pace for five body-lengths
const SPEED = 0.45, FLY_MS = 300, MN9_EATS = 8, GF_FLEES = 20, MEMORY = 1500, MEET_COOLDOWN = 900, PAIR_COOLDOWN = 1500, MEET_RANGE = 45, PATH_EVERY = 25;
export const MARGIN = 0.015;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STOP = new Set(`the and of to in a that for is was it with be not on as are at by this from or an but have had has
its into than then they their there were will would which who what when where how all any some each more most other
over under about after before between through while also only very just can could should may might must do does did
been being out up down off so if no nor too own same such these those them he she his her him you your we our us me my
i one two like still even ever never again once here now across along among around because both during few many much
near new old upon without within yet man men lord whoever himself`.split(/\s+/));
const sigmoid = z => 1 / (1 + Math.exp(-z));
const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
// The world is a band, like a map of a globe: it wraps left to right, but top and bottom are edges.
const wrap = (d, size) => d > size / 2 ? d - size : d < -size / 2 ? d + size : d;
const clampY = (y, m = 0) => Math.max(m, Math.min(H - m, y));

// Organism templates. A type fixes how a creature senses, what it wants, and whether it learns.
export const TYPES = {
  matcher: { name: 'Matcher', tier: 0, strategy: 'glyph', temper: 'open', seed: 'fragment', bar: 0.01,
    pace: 1.4, chew: 60,
    model: 'No model. One fixed rule: the overlap of letter pairs between two ideas (Jaccard index). Nothing is trained and nothing is looked up.',
    reach: 110, acuity: 0.34, smell: 'the letter shapes of whatever words it can make out',
    life: 6000,
    slots: [3, 3],
    blurb: 'The simplest life. It cannot read; it only sees the shapes of letters.',
    looks: 'an amoeba: lumpy shifting outline, no true nucleus',
    senses: 'the letter pairs in an idea', wants: 'ideas spelled like the ones it holds',
    learns: 'nothing', core: 'replaceable at sleep', starts: 'a random 3-letter fragment',
    taste: 'For each idea it holds, count the letter pairs the two share, divided by all the letter pairs in either. Average those, counting core ideas twice.',
    sleep: 'The body idea that best matches everything else moves into the nucleus if it beats the weakest core idea.' },
  forager: { name: 'Forager', tier: 1, strategy: 'kin', temper: 'open', seed: 'virtue', bar: 0.04,
    pace: 1, chew: 90,
    model: 'No learned model. A fixed lookup table of word association: normalised PMI between 1,400 words, counted over 31,890 passages, plus links added by feeding.',
    reach: 150, acuity: 0.34, smell: 'how well the words it can make out travel with what it holds',
    life: 8000,
    slots: [4, 4],
    blurb: 'Reads meaning by association: which words keep company in the source texts.',
    looks: 'a round ciliate: smooth wall fringed with sensing hairs',
    senses: 'the words of an idea and which words they travel with', wants: 'ideas whose words travel with the words it holds now',
    learns: 'nothing; it looks association up in a fixed table', core: 'replaceable at sleep', starts: 'one virtue word',
    taste: 'For each idea it holds, match every word to its closest companion in the other idea and average the strengths. Average over held ideas, counting core ideas twice.',
    sleep: 'The body idea that best fits everything else moves into the nucleus if it beats the weakest core idea.' },
  empath: { name: 'Empath', tier: 1, strategy: 'tags', temper: 'open', seed: 'virtue', bar: 0.04,
    reach: 190, acuity: 0.34, smell: 'the mood of an idea, fainter with distance',
    pace: 1.1, chew: 80, life: 8000, slots: [4, 4],
    model: 'No model. It reads the labels you gave each idea (its ideals and feelings) and counts how many it shares with what it holds. It only works in a soup whose ideas carry such labels.',
    blurb: 'Feels, and does not read. It gathers by the ideals and feelings an idea was tagged with, whatever the words say.',
    looks: 'a soft bloom: six slow petals',
    senses: 'the ideals and feelings an idea is labelled with', wants: 'ideas that share labels with what it holds',
    learns: 'nothing', core: 'replaceable at sleep', starts: 'one ideal',
    taste: 'For each idea it holds, the labels the two share divided by all the labels on either. Average those, counting core ideas twice.',
    sleep: 'The body idea that best fits everything else moves into the nucleus if it beats the weakest core idea.' },
  keeper: { name: 'Keeper', tier: 1, strategy: 'kin', temper: 'shard', seed: 'virtue', bar: 0.04,
    pace: 0.7, chew: 110,
    model: 'No learned model. The same word-association table as the Forager, applied to the three core ideas only.',
    reach: 150, acuity: 0.34, smell: 'how well the words it can make out travel with its core',
    life: 8000,
    slots: [5, 5],
    sides: 4,
    blurb: 'A forager that is constituted by its core. The body only ever serves the nucleus.',
    looks: 'a crystal: rigid hexagonal wall and nucleus',
    senses: 'the words of an idea and which words they travel with', wants: 'ideas that travel with its core, ignoring its body',
    learns: 'nothing', core: 'fixed once the three slots fill', starts: 'one virtue word',
    taste: 'Same matching as the Forager, but measured against the three core ideas only.',
    sleep: 'Fills empty core slots from the body. Once the nucleus is full it never changes again.' },
  learner: { name: 'Learner', tier: 2, strategy: 'learned', temper: 'open', seed: 'virtue', bar: -1,
    pace: 0.9, chew: 100,
    model: 'Logistic regression, trained online inside the creature (gradient descent, 4 passes per sleep, 3% weight decay). Features: the words of an idea and their 4 closest companions. Each creature has its own weights.',
    reach: 170, acuity: 0.34, smell: 'its trained taste, applied to the words it can make out',
    life: 14000,
    slots: [10, 14],
    sides: 6,
    blurb: 'Carries a small trained model. Its taste is its own history, not a lookup against what it holds.',
    looks: 'a twelve-sided neuron: double wall, dendrites, a web to every body idea',
    senses: 'the words of an idea plus the company those words keep', wants: 'whatever its trained taste scores highly',
    learns: 'at sleep, a small classifier: ideas that sat well are good examples, ideas it dropped are bad ones',
    core: 'replaceable at sleep', starts: 'one virtue word and no taste; while it has room it accepts everything',
    taste: 'Add up the learned weight of every cue in the idea (its words and their close companions) and squash to a score between −0.5 and +0.5. What it currently holds does not enter the calculation.',
    sleep: 'First retrains its classifier on the body and on what it dropped since last sleep. Then updates the nucleus like a Forager.' },
  forest: { name: 'Forest', tier: 2, strategy: 'forest', temper: 'open', seed: 'virtue', bar: -1,
    pace: 0.8, chew: 110,
    model: 'Random forest: 12 small decision trees (depth 3), rebuilt at each sleep from the last 60 ideas the creature judged. Each tree asks yes/no questions like "does this idea mention wisdom or its companions?"',
    reach: 170, acuity: 0.34, smell: 'its trees, voting on the words it can make out',
    life: 14000,
    slots: [12, 16],
    sides: 8,
    blurb: 'A second kind of learned taste: many small trees voting, instead of one weighted sum.',
    looks: 'a ten-sided canopy: branches inside',
    senses: 'the words of an idea plus the company those words keep', wants: 'whatever most of its trees vote for',
    learns: 'at sleep, regrows all its trees from what it remembers keeping and dropping',
    core: 'replaceable at sleep', starts: 'one virtue word and no trees; while it has room it accepts everything',
    taste: 'Each tree follows up to three yes/no questions about the idea and votes. The score is the share of yes votes minus one half.',
    sleep: 'Adds the body (good and poor fits) and recent drops to its memory, regrows its trees, then updates the nucleus like a Forager.' },
  fly: { name: 'Fly', tier: 3, strategy: 'fly', temper: 'open', seed: 'virtue', bar: 0.04,
    pace: 2.2, chew: 80,
    model: 'Spiking neural network: 2,234 leaky integrate-and-fire neurons and 169,695 synapses, distilled from the FlyWire v783 map of an adult fruit-fly brain (Shiu et al. 2024 model). Not trained; the wiring is the real fly\'s. From the connectome: sugar taste neurons → the MN9 feeding motor neuron, and looming detectors → the Giant Fiber escape neuron. Hand-built: the "tongue" that turns an idea into sweetness is the Forager\'s rule.',
    reach: 230, acuity: 0.2, smell: 'sweetness on the wind, from far off but blurry. This steering is hand-built: in the fly connectome, smell carries no direction',
    life: 10000,
    slots: [6, 6],
    sides: 10,
    blurb: 'A real brain wiring diagram decides whether to eat. Fast, jumpy, and it will not feed while something looms.',
    looks: 'a fly: red eyes, wings, legs',
    senses: 'sweetness (how well an idea fits, by the Forager rule) and anything approaching',
    wants: 'whatever makes its feeding neuron fire', learns: 'nothing; the connectome has no plasticity here',
    core: 'replaceable at sleep', starts: 'one virtue word',
    taste: 'The idea\'s fit sets how hard 20 sugar-sensing neurons are driven. Approaching cells drive the looming detectors. The brain runs for 300 ms; it eats if the feeding neuron MN9 spikes at least 8 times. Because the inputs are noisy spikes, borderline ideas can go either way. If the Giant Fiber fires, it flees.',
    sleep: 'The body idea that best fits everything else moves into the nucleus if it beats the weakest core idea.' },
  seer: { name: 'Seer', tier: 3, strategy: 'embed', temper: 'open', seed: 'virtue', bar: 0.04, sides: 12,
    reach: 210, acuity: 0.34, smell: 'closeness in meaning, fainter with distance',
    pace: 0.8, chew: 100, life: 12000, slots: [14, 22],
    model: 'A text-embedding model (nomic-embed-text, 137 million parameters) run once over every idea when the soup was built. Each idea became a point in a 768-dimensional space; the Seer compares distances between those points. It is not trained here and nothing runs while you watch. Ideas with no stored point (fed blocks, glimpses) fall back to the Forager rule.',
    blurb: 'Sees meaning directly: two ideas are alike if a language model placed them close together, even with no word in common.',
    looks: 'a twelve-sided eye: rings in the nucleus, fine rays',
    senses: 'where each idea sits in a learned space of meaning', wants: 'ideas that sit close to the ones it holds',
    learns: 'nothing; the map of meaning was learned elsewhere and is fixed', core: 'replaceable at sleep', starts: 'one virtue word or ideal',
    taste: 'For each idea it holds, how close the two sit in the embedding space (rescaled so a typical pair scores 0 and the closest 1% about 0.5). Average those, counting core ideas twice.',
    sleep: 'The body idea that best fits everything else moves into the nucleus if it beats the weakest core idea.' },
  // Two kinds that stand apart from the ladder: nothing buds into them and they bud only their own kind.
  tree: { name: 'Tree', tier: 0, strategy: 'kin', temper: 'open', seed: 'virtue', bar: 0.03, apart: true, rooted: true,
    pace: 0, chew: 140,
    model: 'No learned model. The same word-association table the Forager uses.',
    reach: 230, acuity: 0.34, smell: 'how well the words it can make out travel with what it holds',
    life: 30000,
    slots: [6, 36],
    blurb: 'In the ecosystem a tree is not a creature but a web: it joins nearby ideas that belong together, leaving them where they are. Eat an idea in the middle and the tree falls into two.',
    looks: 'no wall: a trunk with a branch out to every idea it holds',
    senses: 'the words of an idea and which words they travel with', wants: 'nearby ideas whose words travel with the words it holds',
    learns: 'nothing; it looks association up in a fixed table', core: 'replaceable at sleep', starts: 'one virtue word',
    taste: 'As the Forager, but from where it stands: a root reaches any idea within range and draws it in.',
    sleep: 'The body idea that best fits everything else moves into the nucleus if it beats the weakest core idea.',
    headlines: ['It grows by one slot with every idea it takes, up to 36', 'Other organisms graze on it: up to three ideas a bite, and a tree with almost nothing left is eaten whole', 'A bite of tree takes 4,000 ticks to digest, and the grazer is slow until it has'] },
  frog: { name: 'Frog', tier: 3, strategy: 'kin', temper: 'open', seed: 'virtue', bar: 0.04, apart: true, hunter: true,
    pace: 0.9, chew: 100,
    model: 'No model of ideas at all. It does not read; it only judges size and distance.',
    reach: 150, acuity: 0.34, smell: 'nothing: it ignores ideas adrift',
    life: 14000,
    slots: [3, 5],
    blurb: 'A predator. It never eats an idea from the soup, only other organisms, and it goes for flies first.',
    looks: 'a round body with two eyes on top and folded back legs',
    senses: 'other organisms: how big they are and how far', wants: 'flies above all, then anything not much bigger than itself',
    learns: 'nothing', core: 'replaceable at sleep', starts: 'one virtue word',
    taste: 'It does not taste ideas. Everything it holds came out of something it swallowed.',
    sleep: 'As the others: the body idea that best fits the rest can move into the nucleus.',
    headlines: ['It hops: a short dash when prey is close', 'It can swallow anything up to 1.6 times its own radius, and any fly', 'Trees and other frogs are safe from it'] },
  llm: { name: 'Librarian', tier: 4, strategy: 'llm', temper: 'open', seed: 'virtue', bar: 0.04,
    pace: 0.5, chew: 120,
    model: 'A small language model running locally through Ollama, prompted with the creature\'s ideas. Not trained here. If no model answers, it falls back to the Forager rule and says so.',
    reach: 260, acuity: 0.3, headlines: true, smell: 'headlines: it can read three words of any idea in range, by the Forager rule (no model call until it tastes)',
    life: 0,
    slots: [20, 30],
    sides: 16,
    blurb: 'Reads. It is shown what it holds and the new idea, and answers in words. Slow, large, and it can say why.',
    looks: 'an octagonal library: heavy wall, shelves in the nucleus',
    senses: 'the full text of every idea it holds and the one in front of it', wants: 'ideas it judges to belong with its collection',
    learns: 'nothing between decisions; what it holds is its whole context',
    core: 'chosen by the model at sleep', starts: 'one virtue word',
    taste: 'Its first five ideas it simply collects. After that it shows the model its core ideas, the eight body ideas that fit it least, and the new one, in shuffled order, and asks which belongs least and why. If the model names the new idea, it passes. Otherwise it absorbs it, giving up the one named if it has no room left. (Asked to rate ideas out of 10 instead, the models approved of nearly everything.)',
    sleep: 'Asks the model which three of its ideas best express what the collection is about; those become the nucleus.' },
};

const n8 = n => n > 4;   // with two rows of continents the inlet moves up to the top edge
const bigrams = w => { const s = []; for (let i = 0; i < w.length - 1; i++) s.push(w.slice(i, i + 2)); return s; };

// Word-level association (fixed table plus links learned from fed blocks) and the idea-level
// affinities built on it.
export function makeAffinity(soup) {
  const index = new Map(soup.vocab.map((w, i) => [w, i]));
  const maps = soup.kin.map(l => new Map(l));
  const extra = new Map();
  let cache = new Map();
  const word = (a, b) => {
    if (a === b) return 1;
    const fed = extra.get(a)?.get(b) ?? 0;
    const i = index.get(a), j = index.get(b);
    if (i === undefined || j === undefined) return fed;
    return Math.max(fed, maps[i].get(j) ?? maps[j].get(i) ?? 0);
  };
  const oneWay = (A, B) => mean(A.map(a => Math.max(...B.map(b => word(a, b)))));
  const memo = (tag, a, b, f) => {
    const k = a.id < b.id ? `${tag}${a.id}|${b.id}` : `${tag}${b.id}|${a.id}`;
    let v = cache.get(k);
    if (v === undefined) cache.set(k, v = f());
    return v;
  };
  return {
    extra, word,
    link(a, b, v) {
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!extra.has(x)) extra.set(x, new Map());
        extra.get(x).set(y, Math.max(v, extra.get(x).get(y) ?? 0));
      }
      cache = new Map();
    },
    // the k words most strongly known to go with w
    near(w, k) {
      const out = [...(extra.get(w) ?? [])];
      const i = index.get(w);
      if (i !== undefined) for (const [j, v] of soup.kin[i]) out.push([soup.vocab[j], v]);
      return out.sort((a, b) => b[1] - a[1]).slice(0, k).map(([x]) => x);
    },
    // kin: the two ideas' words travel together in the texts
    kin: (a, b) => a === b ? 1 : !a.words.length || !b.words.length ? 0
      : memo('k', a, b, () => (oneWay(a.words, b.words) + oneWay(b.words, a.words)) / 2),
    // tags: the two ideas carry the same labels (ideals, feelings)
    tags: (a, b) => {
      if (a === b) return 1;
      if (!a.tags?.length || !b.tags?.length) return 0;
      let n = 0; for (const t of a.tags) if (b.tags.includes(t)) n++;
      return n / (a.tags.length + b.tags.length - n);
    },
    // embed: the two ideas sit close together in an embedding model's space of meaning
    embed(a, b) { return a === b ? 1 : a.e != null && b.e != null ? soup.sim[a.e * soup.simN + b.e] : this.kin(a, b); },
    // glyph: the two ideas are spelled alike; knows nothing about meaning
    glyph: (a, b) => a === b ? 1 : memo('g', a, b, () => {
      let n = 0;
      for (const g of a.grams) if (b.grams.has(g)) n++;
      return n ? n / (a.grams.size + b.grams.size - n) : 0;
    }),
  };
}

export class World {
  // pop: [{ n, type }] where type is a key of TYPES
  // circuit: the distilled fly brain (needed for flies). oracle: async (kind, payload) => answer, for Librarians.
  // axioms: optional starting core ideas, handed out to the creatures in order instead of random seeds.
  // mortal: false turns lifespans off, so no creature ever becomes a pod or is reborn.
  // map: how the soup is laid out. 'orrery': each family is a system of rings, the systems circling
  // the centre. 'one': every idea on the rings of a single continent, family by family.
  // 'dish': a petri dish. Each family is a loose cloud somewhere on the dish, wide enough to run into its
  // neighbours, and a quarter of the ideas are strewn anywhere, so regions differ but nothing is fenced off.
  // The whole dish turns slowly. plate is the radius of the dish.
  // 'scatter': no systems at all; each star circles a random point of its own and now and then moves to another.
  // 'flow': one stream that winds around the world. It runs slow and wide in three pools, where the
  // stars bunch up, and fast and narrow between them. The families follow one another along it.
  // eco: the ecosystem. Creatures bud when full (a child sometimes one step more complex than its
  // parent), a clearly larger creature swallows a smaller one whole, and death is final; every
  // creature that ever lived is kept in this.lineage, which is the tree of life.
  // quest: a search party. Each creature keeps the idea it was sent out with as a fixed core idea.
  constructor(soup, { pop, circuit, oracle, axioms, mortal = true, map = 'orrery', eco = false, quest = false, plate = PLATE, mutate = true, webs = eco ? 3 : 0 }, seed = 1) {
    this.map = map; this.plate = plate; this.census = []; this.eco = eco; this.quest = quest; this.lineage = []; this.nextCreature = 0;
    if (eco) mortal = true;
    this.mutate = mutate; this.webSeeds = webs; this.webs = []; this.inWeb = new Map();   // mutate: may a child be a more complex kind than its parent. webs: how many trees to keep growing
    this.soup = soup; this.aff = makeAffinity(soup); this.rand = rng(seed);
    this.tick = 0; this.nextIdea = 0; this.circuit = circuit; this.oracle = oracle; this.mortal = mortal;
    this.counts = { trades: 0, coreChanges: 0, absorbed: 0, passed: 0 };
    this.log = []; this.fed = []; this.particles = []; this.pairMet = new Map();
    this.kinTable = new Float32Array(KIN_CAP * KIN_CAP).fill(NaN); this.affVersion = 0;
    this.minted = 0; this.pods = { made: 0, eaten: 0, dissolved: 0 };
    const ideas = soup.ideas.map(i => this.idea(i.t, i.src, undefined, { home: i.home, tags: i.tags, e: i.e, at: i.at }));
    this.settle(ideas);
    for (const idea of ideas) this.drop(idea, ...this.slotPos(idea));
    this.creatures = [];
    for (const g of pop) for (let k = 0; k < g.n; k++) {
      const T = TYPES[g.type], r = this.rand, pick = l => l[Math.floor(r() * l.length)];
      let text = pick(soup.virtues);
      if (T.seed === 'fragment') { const w = pick(soup.vocab), i = Math.floor(r() * (w.length - 2)); text = w.slice(i, i + 3); }
      // an axiom can be plain text, or one of the soup's own (an ideal, with its labels and its place in meaning)
      const ax = axioms?.length ? axioms[this.creatures.length % axioms.length] : null;
      if (ax) text = ax.t ?? ax;
      const seedIdea = this.idea(text, 'seed', undefined, ax?.t ? { tags: ax.tags, e: ax.e, label: ax.label } : undefined);
      const c = this.spawn(g.type, seedIdea, 0, 0);
      this.minted++;
      [c.x, c.y] = this.somewhere(ax?.home ?? Math.floor(r() * this.nLands), 0.7);
    }
    for (let k = 0; k < this.webSeeds; k++) this.seedWeb();
    this.cast = [...new Set(pop.map(g => g.type))];   // the kinds this dish began with
  }

  spawn(type, seedIdea, x, y, from = null) {
    const T = TYPES[type], r = this.rand, id = this.nextCreature++;
    const line = { id, type, parent: from?.id ?? null, gen: from ? from.line.gen + 1 : 0, born: this.tick, died: null, cause: null, by: null, seed: seedIdea.text };
    this.lineage.push(line);
    const c = { id, type, strategy: T.strategy, temper: T.temper, line, parent: line.parent,
      x, y, heading: r() * Math.PI * 2, core: [seedIdea], body: [], seed: seedIdea,
      born: this.tick, lives: 1, life: this.mortal ? (T.life || (this.eco ? ECO_LIFE : 0)) * (0.8 + 0.4 * r()) : 0, cap: T.slots[0], sleeps: 0,
      state: 'roam', timer: 0, target: null, job: null, tasted: new Map(), lastMeet: -1e9,
      weights: new Map(), bias: 0, dropped: [], coreChanges: 0, events: [], path: [],
      nextSleep: this.tick + SLEEP / 2 + (id % 12) * 97, nextBud: this.tick + BUD_REST,
      pace: T.pace * (0.85 + 0.3 * r()), memory: [], trees: [], dash: 0, sensed: [], looks: new Map(), surprise: 0,
      brain: T.strategy === 'fly' && this.circuit ? new LIF(this.circuit, r) : null };
    this.creatures.push(c);
    return c;
  }

  // The sky is an orrery. Each group of ideas is a system that circles the centre of the world on
  // a tilted ellipse. There are two shells of systems turning in opposite directions on crossing
  // paths, so systems pass through one another and their stars mingle for a while.
  layout(sizes) {
    const n = sizes.length, inner = n >= 4 ? Math.floor(n * 0.4) : 0;
    // the shells are close enough that inner and outer systems overlap whenever they pass
    const shells = [{ count: inner, a: 430, b: 220, tilt: -0.38, w: -0.0003 }, { count: n - inner, a: 760, b: 380, tilt: 0.3, w: 0.00014 }];
    const out = [];
    for (const [si, sh] of shells.entries()) for (let i = 0; i < sh.count; i++)
      out.push({ id: out.length, shell: this.map === 'orrery' ? sh : null, phase: i / sh.count * Math.PI * 2 + si * 0.7, x: 0, y: 0, r: 100, hue: Math.round(out.length / n * 360 + 200) % 360 });
    return out;
  }
  landPos(L, t = this.tick) {
    if (!L.shell) return [W / 2, H / 2];
    const { a, b, tilt, w } = L.shell, th = L.phase + w * t, x = a * Math.cos(th), y = b * Math.sin(th);
    return [W / 2 + x * Math.cos(tilt) - y * Math.sin(tilt), H / 2 + x * Math.sin(tilt) + y * Math.cos(tilt)];
  }
  // Inside a system the ideas are stars on rings, each ring turning the opposite way to the one
  // inside it. The order along the rings is not random: ideas that share a label are grouped, and
  // within a group each idea sits next to the one it has most in common with, so neighbours on a
  // ring are kin. Every idea has one slot it belongs in and returns to.
  buildSlots(ideas) {
    const chain = list => {
      const left = [...list], out = left.length ? [left.shift()] : [];
      while (left.length) { let best = 0, score = -1; left.forEach((x, i) => { const k = this.kinFast(out.at(-1), x) + this.aff.embed(out.at(-1), x); if (k > score) { score = k; best = i; } }); out.push(left.splice(best, 1)[0]); }
      return out;
    };
    const grouped = L => {
      const groups = new Map();
      for (const i of ideas.filter(i => i.home === L.id)) { const g = i.tags?.[0] ?? ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); }
      return [...groups.values()].sort((x, y) => x.length - y.length).flatMap(chain);
    };
    // lay a list of ideas on the rings of one land, starting at radius r
    const lay = (L, order, r) => {
      L.rings = [];
      let k = 0;
      while (k < order.length) {
        const cap = Math.max(3, Math.floor(2 * Math.PI * r / 52)), row = order.slice(k, k + cap), dir = L.rings.length % 2 ? -1 : 1;
        row.forEach((idea, i) => { idea.slot = { land: L.id, r, a: i / row.length * Math.PI * 2 + L.id, w: dir * 0.05 / r, ring: L.rings.length }; });
        L.rings.push({ r, ideas: row }); k += cap; r += 58;
      }
      L.r = r - 18;
    };
    const families = this.lands.filter(L => !L.inlet);
    if (this.map === 'orrery') for (const L of families) lay(L, grouped(L), 62);
    else {
      // the families are still there (an idea keeps its family's colour and name) but have no place of their own
      for (const L of families) { L.rings = []; L.hidden = true; }
      if (this.map === 'one') {
        const all = { id: this.lands.length, name: this.soup.name, hue: 210 };
        lay(all, families.flatMap(grouped), 130);   // the inlet sits in the middle of the continent
        this.lands.push(all);
        for (const L of families) L.r = all.r;
      } else if (this.map === 'dish') {
        const P = this.plate, gauss = () => (this.rand() + this.rand() + this.rand() - 1.5) * 1.15, placed = [];
        families.forEach((L, k) => { const a = k / families.length * Math.PI * 2 + this.rand() * 0.7, d = P * (0.25 + 0.42 * this.rand()); L.at = [Math.cos(a) * d, Math.sin(a) * d]; L.hidden = false; L.r = P * 0.2; L.cloud = true; });
        // a soup can bring its own places (at: a point in the unit disc), as a mirror of a note graph does
        for (const L of families) { const mine = ideas.filter(i => i.home === L.id && i.at); if (mine.length) L.at = [0, 1].map(j => mine.reduce((n, i) => n + i.at[j], 0) / mine.length * (P - 40)); }
        for (const idea of ideas) {
          const L = this.lands[idea.home], loose = !L?.at || this.rand() < 0.25;
          let best = idea.at ? idea.at.map(v => v * (P - 40)) : null, far = -1;   // of a few tries, the one with most room around it
          for (let k = 0; k < 4 && !idea.at; k++) {
            let q = loose ? this.onPlate().map((v, j) => v - (j ? H / 2 : W / 2)) : [L.at[0] + gauss() * P * 0.34, L.at[1] + gauss() * P * 0.34];
            const m = Math.hypot(q[0], q[1]); if (m > P - 40) q = q.map(v => v * (P - 40) / m);
            const d = Math.min(1e9, ...placed.map(o => Math.hypot(o[0] - q[0], o[1] - q[1])));
            if (d > far) { far = d; best = q; }
          }
          placed.push(best);
          idea.slot = { land: idea.home, free: best, turn: true, fixed: !!idea.at, r: idea.at ? 3 + this.rand() * 6 : 6 + this.rand() * 22, a: this.rand() * Math.PI * 2, w: (this.rand() < 0.5 ? -1 : 1) * (0.0008 + this.rand() * 0.002), ring: 0 };
        }
      } else if (this.map === 'flow') {
        const order = families.flatMap(grouped);
        order.forEach((idea, i) => { idea.slot = { land: idea.home, flow: true, a: i / order.length * Math.PI * 2, off: this.rand() * 2 - 1,
          w: 0.00025 * (0.8 + 0.4 * this.rand()), wob: 0.002 + this.rand() * 0.004, ring: 0 }; });
        for (const L of families) L.r = H * 0.4;
      } else {
        const placed = [];
        for (const idea of ideas) {
          let best = null, far = -1;   // of a few random points, the one with most room around it
          for (let k = 0; k < 6; k++) {
            const q = this.onPlate(), d = Math.min(1e9, ...placed.map(o => Math.hypot(o[0] - q[0], o[1] - q[1])));
            if (d > far) { far = d; best = q; }
          }
          placed.push(best);
          idea.slot = { land: idea.home, free: best, r: 10 + this.rand() * 40, a: this.rand() * Math.PI * 2, w: (this.rand() < 0.5 ? -1 : 1) * (0.0006 + this.rand() * 0.0016), ring: 0 };
        }
        for (const L of families) L.r = H * 0.45;
      }
    }
    this.lands.find(L => L.inlet).r = 60;
    this.moveLands();
  }
  // When two systems overlap, their stars can change places. A star crosses over if it would have
  // more in common with its new ring-neighbours than with its old ones, and the star it displaces
  // gains too. It keeps the colour of the family it came from, so migrants can be seen.
  mingle() {
    const adrift = new Set(this.particles.map(p => p.idea)), lands = this.lands.filter(L => L.rings?.length);
    const sits = (idea, ring, i) => { const n = ring.ideas.length, k = x => x === idea ? 0 : this.kinFast(idea, x) + this.aff.embed(idea, x); return (k(ring.ideas[(i + n - 1) % n]) + k(ring.ideas[(i + 1) % n])) / 2; };
    for (let x = 0; x < lands.length; x++) for (let y = x + 1; y < lands.length; y++) {
      const A = lands[x], B = lands[y];
      if (Math.hypot(A.x - B.x, A.y - B.y) > A.r + B.r) continue;
      let best = null, gain = 0.08;
      for (const ra of A.rings) ra.ideas.forEach((a, i) => { if (!adrift.has(a)) return;
        const here = sits(a, ra, i);
        for (const rb of B.rings) rb.ideas.forEach((b, j) => { if (!adrift.has(b)) return;
          const ga = sits(a, rb, j) - here, gb = sits(b, ra, i) - sits(b, rb, j);
          if (ga > 0 && gb > 0 && ga + gb > gain) { gain = ga + gb; best = [ra, i, rb, j]; }
        });
      });
      if (!best) continue;
      const [ra, i, rb, j] = best, a = ra.ideas[i], b = rb.ideas[j];
      [ra.ideas[i], rb.ideas[j]] = [b, a]; [a.slot, b.slot] = [b.slot, a.slot];
      this.counts.crossings = (this.counts.crossings ?? 0) + 1; this.links = null;
      this.note(`"${short(a.text, 26)}" and "${short(b.text, 26)}" changed places between ${A.name} and ${B.name}`, 'cross');
    }
  }
  // A point of the stream. phase runs evenly in time; the stream turns it into an angle that lingers
  // in the pools, so stars are dense there. off (-1 to 1) is the place across the stream, which is
  // wider where it is slower.
  flowPos(phase, off = 0, wobble = 0) {
    const th = phase + 0.25 * Math.sin(3 * phase), wide = 0.07 + 0.06 / (1 + 0.75 * Math.cos(3 * phase));
    const r = (1 + 0.24 * Math.sin(2 * th + 0.6) + 0.14 * Math.sin(5 * th + 2)) * (1 + off * wide + wobble);
    return [W / 2 + 0.26 * W * r * Math.cos(th), clampY(H / 2 + 0.25 * H * r * Math.sin(th), 8)];
  }
  slotPos(idea, t = this.tick) {
    const sl = idea.slot, a = sl.a + sl.w * t;
    if (sl.flow) return this.flowPos(a, sl.off, 0.02 * Math.sin(t * sl.wob + sl.a * 7));
    if (sl.turn) { const [x, y] = this.turned(sl.free, t); return [x + Math.cos(a) * sl.r, y + Math.sin(a) * sl.r]; }
    if (sl.free) return [sl.free[0] + Math.cos(a) * sl.r, clampY(sl.free[1] + Math.sin(a) * sl.r, 8)];
    const L = this.lands[sl.land];
    return [L.x + Math.cos(a) * sl.r, L.y + Math.sin(a) * sl.r];
  }

  // A soup can bring its own continents (its own families). Otherwise the soup is divided by
  // theme: four ideas that have little to do with each other become the founders, and every other
  // idea joins the founder it travels with most (with a cap, so no continent takes everything).
  // Each such continent is named after its most distinctive words.
  settle(ideas) {
    const own = this.soup.lands;
    this.nLands = own ? own.length : LANDS.length;
    if (!own) {
      const founders = [ideas.reduce((a, b) => b.words.length > a.words.length ? b : a)];
      while (founders.length < this.nLands) {
        let best = null, low = Infinity;
        for (const i of ideas) if (!founders.includes(i) && i.words.length > 3) { const k = Math.max(...founders.map(f => this.kinFast(i, f))); if (k < low) { low = k; best = i; } }
        founders.push(best);
      }
      const cap = Math.ceil(ideas.length / this.nLands) + 8, size = founders.map(() => 0);
      const pairs = ideas.flatMap(i => founders.map((f, k) => [this.kinFast(i, f) + this.rand() * 1e-3, i, k])).sort((a, b) => b[0] - a[0]);
      for (const i of ideas) i.home = undefined;
      for (const [, i, k] of pairs) if (i.home === undefined && size[k] < cap) { i.home = k; size[k]++; }
    }
    const count = l => { const m = new Map(); for (const i of l) for (const w of i.words) m.set(w, (m.get(w) ?? 0) + 1); return m; }, all = count(ideas);
    this.lands = this.layout(Array.from({ length: this.nLands }, (_, k) => ideas.filter(i => i.home === k).length || 1));
    this.lands.forEach((L, k) => {
      const mine = count(ideas.filter(i => i.home === k));
      const top = [...mine].filter(([, n]) => n >= 3).sort((a, b) => b[1] / all.get(b[0]) * Math.sqrt(b[1]) - a[1] / all.get(a[0]) * Math.sqrt(a[1])).slice(0, 2).map(x => x[0]);
      L.name = own ? own[k].name : top.join(' & ') || `land ${k + 1}`; L.note = own?.[k].note; if (own?.[k].color) L.color = own[k].color;
    });
    // the inlet, where fed ideas arrive, is the still centre everything turns around
    this.lands.push({ id: this.nLands, x: W / 2, y: H / 2, r: 60, name: 'the inlet', inlet: true, hue: 38, fedCount: 0 });
    this.buildSlots(ideas);
  }
  // the dish turns as one, a full turn in about 100,000 ticks
  turned(q, t = this.tick) { const a = t * 0.00006, c = Math.cos(a), s = Math.sin(a); return [W / 2 + q[0] * c - q[1] * s, H / 2 + q[0] * s + q[1] * c]; }
  moveLands() { for (const L of this.lands) [L.x, L.y] = L.at ? this.turned(L.at) : this.landPos(L); }

  onPlate() { const a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * (this.plate - 50); return [W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d]; }
  somewhere(home, spread = 0.95) {
    if (this.map === 'scatter' || this.map === 'dish') return this.onPlate();
    if (this.map === 'flow') return this.flowPos(this.rand() * Math.PI * 2, this.rand() * 2 - 1);
    const L = this.lands[home], a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * L.r * spread;
    return [L.x + Math.cos(a) * d, L.y + Math.sin(a) * d];
  }

  // Lifecycle. A mortal creature that reaches the end of its life turns into a pod: a static cluster
  // holding everything it gathered, labelled by its core. The creature is reborn elsewhere with one
  // idea taken from the soup around it. A pod is an idea in its own right, so a higher-tier creature
  // can absorb it whole as one body idea, and pods can end up nested inside pods. A pod nobody eats
  // dissolves after SHELF ticks and its ideas drift home, so nothing is ever lost.
  // everything a creature holds, packed into a pod and left where it stands
  shed(c, src) {
    const T = TYPES[c.type], parts = this.held(c);
    const pod = this.idea(c.core.map(i => i.pod ? i.label : i.text).join(' · ').slice(0, 160), src ?? `pod of #${c.id} ${T.name}, life ${c.lives}`);
    Object.assign(pod, { e: c.core[0].e, tags: [...new Set(c.core.flatMap(i => i.tags ?? []))], home: undefined, pod: true, parts, core: [...c.core], label: short(c.core[0].pod ? c.core[0].label : c.core[0].text, 40), tier: T.tier, maker: c.type, made: this.tick,
      depth: 1 + Math.max(0, ...parts.map(i => i.depth ?? 0)), size: Math.hypot(...parts.map(i => i.size)) });   // a pod is as big as its contents
    this.pods.made++;
    this.record(c, { kind: 'pod', pod, core: [...c.core], body: [...c.body] });
    return this.drop(pod, c.x, c.y);
  }
  pupate(c) {
    const T = TYPES[c.type], pod = this.shed(c).idea, parts = pod.parts;
    this.note(`#${c.id} ${T.name} became a pod: "${pod.label}" (${parts.length} ideas${pod.depth > 1 ? `, ${pod.depth} levels deep` : ''})`, 'pod');
    // reborn on a random continent, starting from an idea it finds there
    [c.x, c.y] = this.somewhere(Math.floor(this.rand() * this.nLands), 0.7);
    let near = null, d = Infinity;
    for (const p of this.particles) if (!p.idea.pod) { const q = wrap(p.x - c.x, W) ** 2 + (p.y - c.y) ** 2; if (q < d) { d = q; near = p; } }
    let seed;
    if (near) { seed = near.idea; this.particles.splice(this.particles.indexOf(near), 1); }
    else { seed = this.idea(this.soup.virtues[Math.floor(this.rand() * this.soup.virtues.length)], 'seed'); this.minted++; }
    Object.assign(c, { core: [seed], body: [], seed, born: this.tick, lives: c.lives + 1, cap: T.slots[0], life: T.life * (0.8 + 0.4 * this.rand()),
      state: 'roam', target: null, job: null, tasted: new Map(), looks: new Map(), sensed: [], weights: new Map(), bias: 0, dropped: [], memory: [], trees: [],
      nextSleep: this.tick + SLEEP / 2 });
    this.record(c, { kind: 'reborn', seedIdea: seed });
  }
  // ---- trees ----
  // A tree is not a creature. It is a web over ideas that stay where they are in the dish: it starts at one
  // idea and, every so often, joins on a nearby idea that belongs with one it already has (by the company
  // their words keep). The ideas are still food. When an organism eats one, the web loses that node and
  // every branch that ran through it, so eating a node in the middle leaves two or more separate trees.
  seedWeb(nodes = null, edges = [], parent = null) {
    if (!nodes) { const free = this.particles.filter(p => !p.idea.pod && !this.inWeb.has(p.idea)); if (!free.length) return null; nodes = [free[Math.floor(this.rand() * free.length)].idea]; }
    const id = this.nextCreature++, line = { id, type: 'tree', parent: parent?.id ?? null, gen: parent ? parent.gen + 1 : 0, born: this.tick, died: null, cause: null, by: null, seed: nodes[0].text };
    this.lineage.push(line);
    const web = { id, line, nodes, edges, born: this.tick, grown: edges.length > 0 };
    for (const n of nodes) this.inWeb.set(n, web);
    this.webs.push(web);
    return web;
  }
  growWebs() {
    const at = new Map(this.particles.map(p => [p.idea, p]));
    for (const web of this.webs) {
      if (web.nodes.length >= WEB_MAX) continue;
      let best = null, top = -1;
      for (const m of web.nodes) {
        const pm = at.get(m); if (!pm) continue;
        for (const p of this.particles) {
          if (p.idea.pod || this.inWeb.has(p.idea)) continue;
          const d = Math.hypot(wrap(p.x - pm.x, W), p.y - pm.y); if (d > WEB_REACH) continue;
          const k = this.kinFast(m, p.idea); if (k < WEB_BAR) continue;
          const s = k - d * 0.0003; if (s > top) { top = s; best = [m, p.idea]; }   // the closest in meaning, a little preferring the closest in space
        }
      }
      if (best) { web.nodes.push(best[1]); web.edges.push(best); this.inWeb.set(best[1], web); web.grown = true; }
    }
  }
  tendWebs() {
    const at = new Map(this.particles.map(p => [p.idea, p]));
    for (const c of this.creatures) if (c.state === 'taste' && c.job?.idea) at.set(c.job.idea, c);   // in a mouth: still attached until it is swallowed
    for (const web of [...this.webs]) {
      const gone = web.nodes.filter(n => !at.has(n));
      const keepEdge = ([a, b]) => at.has(a) && at.has(b) && Math.hypot(wrap(at.get(a).x - at.get(b).x, W), at.get(a).y - at.get(b).y) < WEB_SNAP;   // a branch pulled too far snaps
      if (!gone.length && web.edges.every(keepEdge)) continue;
      for (const n of gone) {   // whoever swallowed it finds wood slow to digest
        this.inWeb.delete(n);
        const eater = this.creatures.find(c => c.core.includes(n) || c.body.includes(n));
        if (eater) { eater.slowUntil = eater.fullUntil = this.tick + DIGEST_TREE; this.counts.grazed = (this.counts.grazed ?? 0) + 1; this.record(eater, { kind: 'grazed', tree: web.id, took: [n] }); }
      }
      const nodes = web.nodes.filter(n => at.has(n)), edges = web.edges.filter(keepEdge), comp = new Map();
      for (const n of nodes) { if (comp.has(n)) continue; const todo = [n]; comp.set(n, n); while (todo.length) { const x = todo.pop(); for (const [a, b] of edges) { const y = a === x ? b : b === x ? a : null; if (y && !comp.has(y)) { comp.set(y, n); todo.push(y); } } } }
      const parts = [...new Set(comp.values())].map(root => nodes.filter(n => comp.get(n) === root)).sort((x, y) => y.length - x.length);
      const main = parts[0] ?? [];
      web.nodes = main; web.edges = edges.filter(([a]) => main.includes(a));
      for (const part of parts.slice(1)) {
        if (part.length < 2) { for (const n of part) this.inWeb.delete(n); continue; }   // a single cut-off idea is just an idea again
        const piece = this.seedWeb(part, edges.filter(([a]) => part.includes(a)), web.line);
        this.note(`tree #${web.id} was cut through: #${piece.id} is now a tree of its own (${part.length} ideas)`, 'bud');
      }
      if (web.nodes.length < (web.grown ? 2 : 1)) {   // nothing left to call a tree (a seed that was eaten before it grew counts too)
        for (const n of web.nodes) this.inWeb.delete(n);
        Object.assign(web.line, { died: this.tick, cause: 'eaten', core: [], held: 0 });
        this.webs.splice(this.webs.indexOf(web), 1);
        this.note(`tree #${web.id} was eaten away`, 'ate');
      }
    }
  }

  // ---- the ecosystem ----
  // An organism as it is at this moment, kept apart from the living one: what it held, how big it was,
  // how well it hung together. Enough to draw it and describe it after it has gone.
  snapshot(c) {
    return { ...c, core: [...c.core], body: [...c.body], state: 'roam', job: null, nap: null, target: null, prey: null, brain: null, dash: 0, station: null,
      events: c.events.slice(-40), path: [], snap: this.tick, alive: !c.gone, coh: this.coherence(c), r: this.radius(c) };
  }
  die(c, cause, by = null) {
    (this.fallen ??= []).push(this.snapshot(c)); this.fallen.at(-1).alive = false;
    (this.moments ??= []).push({ kind: cause === 'eaten' ? 'ate' : 'died', tick: this.tick, x: c.x, y: c.y, r: this.radius(c), id: c.id, type: c.type, by: by ? { id: by.id, type: by.type, x: by.x, y: by.y, r: this.radius(by) } : null });
    if (this.moments.length > 40) this.moments.shift();   // for whoever is watching: a death is worth a moment's attention
    if (this.fallen.length > 400) this.fallen.shift();
    Object.assign(c.line, { died: this.tick, cause, by: by?.id ?? null, core: c.core.map(i => i.pod ? i.label : short(i.text, 60)), held: c.core.length + c.body.length });   // what it was about when it died
    c.gone = true;
    return this.shed(c, `remains of #${c.id} ${TYPES[c.type].name}`);
  }
  // A full creature divides. The child takes half the body, and the first of those ideas is what
  // it starts from. Now and then the child is one step more complex than its parent.
  bud(c) {
    const T = TYPES[c.type], up = Object.keys(TYPES).filter(k => !TYPES[k].apart && TYPES[k].tier === T.tier + 1 && (k !== 'fly' || this.circuit) && (k !== 'empath' || this.soup.ideas[0]?.tags));
    const type = this.mutate && !T.apart && up.length && this.rand() < MUTATE ? up[Math.floor(this.rand() * up.length)] : c.type;
    if (T.apart && this.creatures.filter(x => x.type === c.type).length >= (T.hunter ? MAX_FROGS : MAX_TREES)) { c.nextBud = this.tick + BUD_REST; return; }
    if (this.creatures.filter(x => x.type === type).length >= ECO_CAP / 2) { c.nextBud = this.tick + BUD_REST; return; }   // no kind may be more than half of everything alive
    let give = c.body.filter((i, k) => k % 2 === 0 && !i.pod).slice(0, T.rooted ? 2 : TYPES[type].slots[0] + 1);
    if (T.hunter && c.body.length) {   // a frog holds only what it swallowed: its young starts from one idea out of its oldest meal, and the rest of that meal goes back to the soup
      const meal = this.leaves([c.body.shift()]); give = meal.slice(0, 1);
      for (const i of meal.slice(1)) { const g = this.rand() * Math.PI * 2; this.drop(i, c.x + Math.cos(g) * 14, c.y + Math.sin(g) * 14, Math.cos(g), Math.sin(g)); }
    }
    if (!give.length) { c.nextBud = this.tick + BUD_REST; return; }
    c.body = c.body.filter(i => !give.includes(i));
    const a = this.rand() * Math.PI * 2, d = this.radius(c) + (T.rooted ? 150 + this.rand() * 170 : 30);   // a tree's seed lands further off
    const child = this.spawn(type, give[0], (c.x + Math.cos(a) * d + W) % W, clampY(c.y + Math.sin(a) * d, 20), c);
    child.body = give.slice(1); child.heading = a;
    c.nextBud = this.tick + BUD_REST; c.budded = this.tick; child.budded = this.tick;
    this.counts.births = (this.counts.births ?? 0) + 1;
    this.record(c, { kind: 'bud', child: child.id, type, gave: give });
    this.record(child, { kind: 'born', parent: c.id, from: c.type, gave: give });
    this.note(`#${c.id} ${T.name} ${T.rooted ? 'seeded' : 'budded'} #${child.id}${type !== c.type ? `, a ${TYPES[type].name}: a new kind` : ''}`, type !== c.type ? 'species' : 'bud');
  }
  edible(a, b) {
    const A = TYPES[a.type], B = TYPES[b.type];
    if (A.rooted || B.rooted) return false;   // trees eat nothing alive, and are grazed, not swallowed
    if (this.tick < (a.fullUntil ?? 0) || this.tick - b.born <= SAFE_YOUNG || a.parent === b.id || b.parent === a.id || (a.parent !== null && a.parent === b.parent)) return false;
    if (A.hunter) return !B.hunter && (b.strategy === 'fly' || this.radius(b) <= 1.6 * this.radius(a));
    return A.tier >= B.tier && this.radius(a) >= EAT_RATIO * this.radius(b);
  }
  // Grazing. Anything that walks, bar a frog, can take a bite of a tree if it has room.
  grazable(a, tr) {
    const A = TYPES[a.type];
    return TYPES[tr.type].rooted && !A.rooted && !A.hunter && a.state === 'roam' && (tr.state === 'roam' || tr.state === 'sleep')
      && this.tick >= (a.fullUntil ?? 0) && this.tick - tr.born > 4 * SAFE_YOUNG && a.body.length < a.cap && (tr.body.length > 0 || tr.core.length <= 2);   // a sapling is left alone for a while; a bite needs something to bite
  }
  graze(a, tr) {
    const whole = tr.core.length + tr.body.length <= 2;   // almost nothing left: the whole tree goes
    let took = [];
    if (whole) this.eat(a, tr);
    else {
      const n = Math.min(BITE, a.cap - a.body.length, tr.body.length);
      took = tr.body.splice(tr.body.length - n, n); a.body.push(...took);
      this.counts.grazed = (this.counts.grazed ?? 0) + 1;
      this.record(a, { kind: 'grazed', tree: tr.id, took });
      this.record(tr, { kind: 'bitten', by: a.id, took });
      this.note(`#${a.id} ${TYPES[a.type].name} took ${n} idea${n === 1 ? '' : 's'} from tree #${tr.id}`, 'ate');
    }
    a.fullUntil = a.slowUntil = this.tick + DIGEST_TREE; a.lastMeet = a.gulp = this.tick; a.target = null;   // wood is slow to digest
  }
  // The larger swallows the smaller whole: everything the prey held becomes one pod in the eater's body.
  eat(a, b) {
    const p = this.die(b, 'eaten', a), pod = p.idea;
    // only the prey's core is kept; the rest of what it held spills back into the soup, which keeps the dish fed
    const spill = pod.parts.filter(i => !pod.core.includes(i));
    pod.parts = pod.parts.filter(i => pod.core.includes(i)); pod.size = Math.hypot(...pod.parts.map(i => i.size));
    for (const i of spill) { const g = this.rand() * Math.PI * 2; this.drop(i, p.x + Math.cos(g) * 14, p.y + Math.sin(g) * 14, Math.cos(g) * 1.2, Math.sin(g) * 1.2).ejected = { tick: this.tick, by: a.id, kind: 'pass', x: p.x, y: p.y }; }
    a.fullUntil = this.tick + DIGEST;
    if (a.body.length >= a.cap) a.cap = Math.min(a.cap + 1, TYPES[a.type].slots[1]);
    if (TYPES[a.type].hunter && a.body.length >= a.cap) for (const i of this.leaves([a.body.shift()])) { const g = this.rand() * Math.PI * 2; this.drop(i, a.x + Math.cos(g) * 14, a.y + Math.sin(g) * 14, Math.cos(g), Math.sin(g)); }   // a full frog passes its oldest meal   // a meal can stretch it, up to its kind's limit; past that the remains are left adrift
    if (a.body.length < a.cap) { this.particles.splice(this.particles.indexOf(p), 1); a.body.push(pod); this.pods.eaten++; }
    a.lastMeet = this.tick; a.gulp = this.tick; a.target = null;
    // it stops where it is and eats: the meal takes a while, and can be watched
    a.state = 'eat'; a.timer = EATING; a.dash = 0; a.job = { kind: 'eat', prey: b.id, preyType: b.type, angle: Math.atan2(b.y - a.y, wrap(b.x - a.x, W)), total: EATING };
    this.counts.eaten = (this.counts.eaten ?? 0) + 1;
    this.record(a, { kind: 'ate', prey: b.id, preyType: b.type, pod });
    this.note(`#${a.id} ${TYPES[a.type].name} swallowed #${b.id} ${TYPES[b.type].name} (kept its ${pod.parts.length} core ideas, ${spill.length} spilled)`, 'ate');
  }
  // ---- a search party ----
  // Call the creatures back: each goes to its place around the centre and waits there.
  recall() {
    // a ring wide enough that they can stand side by side without pushing each other off their places
    const R = Math.max(190, this.creatures.reduce((n, c) => n + 2 * this.radius(c) + 24, 0) / (2 * Math.PI));
    this.creatures.forEach((c, k) => { const a = k / this.creatures.length * Math.PI * 2 - Math.PI / 2; c.station = [W / 2 + Math.cos(a) * R, H / 2 + Math.sin(a) * R]; });
  }
  returned() { return this.creatures.length > 0 && this.creatures.every(c => c.station && c.arrived); }
  // What they are carrying, best first: how close each idea is to what its finder was sent for, and how well it sits with the rest.
  findings() {
    return this.creatures.flatMap(c => this.leaves(this.held(c)).filter(i => i !== c.seed && i.src !== 'seed')
      .map(idea => ({ idea, by: c, score: 0.5 * this.sense(c)(c.seed, idea) + 0.5 * this.fit(c, idea), core: c.core.includes(idea) })))
      .sort((x, y) => y.core - x.core || y.score - x.score);
  }

  dissolve(p) {
    this.particles.splice(this.particles.indexOf(p), 1);
    for (const i of p.idea.parts) { const a = this.rand() * Math.PI * 2; this.drop(i, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, Math.cos(a) * 0.8, Math.sin(a) * 0.8).ejected = { tick: this.tick, by: 'a pod', kind: 'pass', x: p.x, y: p.y }; }
    this.pods.dissolved++;
    this.note(`pod "${p.idea.label}" dissolved: ${p.idea.parts.length} ideas return to the soup`, 'pod');
  }
  // every plain idea, however deeply it is packed inside pods
  leaves(list) { return list.flatMap(i => i.pod ? this.leaves(i.parts) : [i]); }

  idea(text, src, block, extra) {
    const tokens = text.toLowerCase().match(/[a-z]+/g) || [];
    return { ...extra, id: this.nextIdea++, text, src, block,
      words: [...new Set(tokens.filter(w => w.length > 2 && !STOP.has(w)))],
      grams: new Set(tokens.flatMap(bigrams)),
      size: (3.5 + 0.2 * Math.sqrt(text.length)) * (this.soup.grain ?? 1) };   // a longer, fuller idea is a bigger star. grain < 1 makes everything smaller, which gives a crowded graph room
  }

  drop(idea, x, y, vx = 0, vy = 0) {
    const p = { idea, x: (x + W) % W, y: clampY(y, 6), vx, vy };
    this.particles.push(p);
    return p;
  }

  // What can be made out of an idea from a distance: its most specific word, then three, then all.
  glimpse(idea, level) {
    if (level >= 3 || idea.words.length <= 1) return idea;
    const n = level === 1 ? 1 : 3;
    if (idea.words.length <= n) return idea;
    idea.far ??= {};
    return idea.far[level] ??= this.idea([...idea.words].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, n).join(' '), 'glimpse');
  }

  // association between two ideas, from a flat table so the whole soup can be compared cheaply
  kinFast(a, b) {
    if (a.id >= KIN_CAP || b.id >= KIN_CAP) return this.aff.kin(a, b);
    const k = a.id * KIN_CAP + b.id;
    let v = this.kinTable[k];
    if (v !== v) v = this.kinTable[k] = this.kinTable[b.id * KIN_CAP + a.id] = this.aff.kin(a, b);
    return v;
  }

  // Geography: every idea is drawn toward the few ideas it travels with most (its kin), and every
  // idea pushes away anything closer than CROWD, so the soup stays spread out like a map. Over time the soup sorts itself into neighbourhoods of related ideas.
  befriend() {
    const ideas = this.particles.map(p => p.idea).concat(this.creatures.flatMap(c => this.held(c))).filter(i => !i.pod);
    this.kinOf = new Map();
    for (const a of ideas) {
      const top = [];
      for (const b of ideas) if (b !== a && b.home === a.home) { const k = this.kinFast(a, b); if (k > 0.05) top.push([k, b]); }
      this.kinOf.set(a.id, top.sort((x, y) => y[0] - x[0]).slice(0, KIN_PULLS).map(x => x[1].id));
    }
  }
  drift() {
    const ps = this.particles, at = new Map(ps.map(p => [p.idea.id, p]));
    if (!this.kinOf || this.tick % 600 < DRIFT_EVERY) this.befriend();
    // currents: an idea away from its continent is carried home across the sea
    for (const a of ps) {
      const L = this.lands[a.idea.home];
      if (!L || a.idea.pod) continue;
      const dx = wrap(L.x - a.x, W), dy = L.y - a.y, d = Math.hypot(dx, dy);
      if (d > L.r * 0.9) { a.vx += dx / d * HOMING; a.vy += dy / d * HOMING; }
    }
    for (const a of ps) for (const id of this.kinOf.get(a.idea.id) ?? []) {
      const b = at.get(id);
      if (!b) continue;
      const dx = wrap(b.x - a.x, W), dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < CROWD * 0.8) continue;
      a.vx += dx / d * PULL; a.vy += dy / d * PULL;
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], dx = wrap(b.x - a.x, W), dy = b.y - a.y;
      if (a.idea.pod && b.idea.pod) continue;
      if (dx > CROWD || dx < -CROWD || dy > CROWD || dy < -CROWD) continue;
      const d = Math.hypot(dx, dy) || 1, f = PUSH * (1 - d / CROWD);
      if (f <= 0) continue;
      a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
    }
  }

  // how sorted the soup is: mean association between each idea and its three nearest neighbours
  sortedness() {
    const ps = this.particles;
    let sum = 0;
    for (const a of ps) {
      const near = ps.filter(b => b !== a).map(b => [wrap(b.x - a.x, W) ** 2 + (b.y - a.y) ** 2, b]).sort((x, y) => x[0] - y[0]).slice(0, 3);
      sum += near.reduce((t, [, b]) => t + this.kinFast(a.idea, b.idea), 0) / 3;
    }
    return sum / ps.length;
  }

  held(c) { return c.core.concat(c.body); }
  // area, not width, grows with what it holds, so a cell of thirty ideas is big without filling the map
  // A creature is as big as what it holds: its area is the summed area of its ideas (each the
  // size it had as a star), plus a little for the cell itself, so eating a big star shows.
  radius(c) { let a = 40 * (this.soup.grain ?? 1) ** 2; for (const i of c.core) a += i.size * i.size; for (const i of c.body) a += i.size * i.size; return BODY * Math.sqrt(a); }
  // What "going together" feels like to c once it holds something. Learners feel association
  // after the fact; they just cannot look it up beforehand.
  felt(c) { return this.sense(c); }
  sense(c) { const a = this.aff; return c.strategy === 'glyph' ? a.glyph : c.strategy === 'tags' ? a.tags : c.strategy === 'embed' ? (x, y) => a.embed(x, y) : a.kin; }

  // The whole decision, with its working shown. Rule creatures compare the idea to what they hold
  // (core counts double; keepers ignore their body). Learners score it with their trained taste.
  judge(c, idea, except) {
    if (c.strategy === 'learned') {
      const cues = this.cues(idea).map(q => ({ cue: q, w: c.weights.get(q) ?? 0 }));
      const z = cues.reduce((s, q) => s + q.w, 0) / Math.sqrt(cues.length || 1);
      return { score: sigmoid(c.bias + z) - 0.5, cues: cues.filter(q => q.w).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 8) };
    }
    if (c.strategy === 'forest') {
      if (!c.trees.length) return { score: 0, cues: [] };
      const has = new Set(this.cues(idea)), seen = new Map();
      let yes = 0;
      for (let n of c.trees) {
        while (n.cue) { const hit = has.has(n.cue); if (hit) seen.set(n.cue, (seen.get(n.cue) ?? 0) + 1); n = hit ? n.yes : n.no; }
        yes += n.p; for (const q of seen.keys()) seen.set(q, seen.get(q));
      }
      const score = yes / c.trees.length - 0.5;
      return { score, cues: [...seen].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cue, k]) => ({ cue, w: Math.sign(score || 1) * k / c.trees.length })) };
    }
    // matchers compare spelling; everyone else (including the fly's tongue and a Librarian
    // with no model to ask) compares by word association
    const f = this.sense(c), comps = [];
    let sum = 0, weight = 0;
    for (const d of c.core) if (d !== except) { const v = f(idea, d); comps.push({ idea: d, v, core: true, counted: true }); sum += 2 * v; weight += 2; }
    for (const b of c.body) if (b !== except) {
      const v = f(idea, b), counted = c.temper === 'open';
      comps.push({ idea: b, v, core: false, counted });
      if (counted) { sum += v; weight += 1; }
    }
    return { score: weight ? sum / weight : 0, comps };
  }
  want(c, idea, except) { return this.judge(c, idea, except).score; }

  cues(idea) {
    if (idea.cueV === this.affVersion) return idea.cueList;
    const out = new Set(idea.words);
    for (const w of idea.words) for (const n of this.aff.near(w, 4)) out.add(n);
    idea.cueV = this.affVersion;
    return idea.cueList = [...out];
  }

  // How well a held idea sits with the rest of what c holds.
  fit(c, idea) {
    const f = this.felt(c);
    return mean(this.held(c).filter(o => o !== idea).map(o => f(idea, o)));
  }

  coherence(c, f = this.felt(c)) {
    const h = this.held(c);
    let sum = 0, n = 0;
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) { sum += f(h[i], h[j]); n++; }
    return n ? sum / n : 0;
  }

  weakest(c) {
    let worst = null, value = Infinity;
    for (const b of c.body) { const v = this.want(c, b, b); if (v < value) { value = v; worst = b; } }
    return { idea: worst, value };
  }

  record(c, e) {
    c.events.push({ tick: this.tick, x: c.x, y: c.y, core: [...c.core], body: [...c.body], ...e });
  }

  step() {
    const t = ++this.tick, r = this.rand;
    this.moveLands();
    // every 100 ticks, a census. n: how many of each kind are alive. h: how many ideas each kind holds
    if (t % 100 === 0) { const n = {}; for (const c of this.creatures) n[c.type] = (n[c.type] ?? 0) + 1; if (this.webs.length) n.tree = (n.tree ?? 0) + this.webs.length; const h = {}; for (const c of this.creatures) h[c.type] = (h[c.type] ?? 0) + this.leaves(this.held(c)).length; for (const web of this.webs) h.tree = (h.tree ?? 0) + web.nodes.length;
      this.census.push({ tick: t, n, h }); if (this.census.length > 1600) this.census = this.census.filter((_, i) => i % 2 === 1); }
    if ((this.map === 'scatter' || this.map === 'dish') && this.tick % 300 === 0) {   // now and then a star leaves for another part of the sky
      const idea = this.particles[Math.floor(this.rand() * this.particles.length)]?.idea;
      if (idea?.slot?.free && !idea.slot.fixed) idea.slot.free = idea.slot.turn ? this.onPlate().map((v, j) => v - (j ? H / 2 : W / 2)) : this.onPlate();
    }
    if (t % 240 === 0) this.mingle();
    if (t % 50 === 0) for (const p of [...this.particles]) if (p.idea.pod && t - p.idea.made > (this.eco ? 1500 : SHELF)) this.dissolve(p);
    for (const p of this.particles) {
      if (p.idea.pod) { p.vx = p.vy = 0; continue; }   // a pod stays where it fell
      if (p.idea.slot) {   // drawn back to its place in its constellation, wherever that has turned to
        const [tx, ty] = this.slotPos(p.idea), dx = wrap(tx - p.x, W), dy = ty - p.y;
        p.vx = p.vx * 0.9 + dx * 0.02; p.vy = p.vy * 0.9 + dy * 0.02;
        const v = Math.hypot(p.vx, p.vy); if (v > 2.2) { p.vx *= 2.2 / v; p.vy *= 2.2 / v; }
      } else { p.vx = (p.vx + (r() - 0.5) * 0.012) * 0.985; p.vy = (p.vy + (r() - 0.5) * 0.012) * 0.985; }   // a loose idea just drifts
      p.x = (p.x + p.vx + W) % W; p.y += p.vy;
      if (p.y < 6 || p.y > H - 6) { p.y = clampY(p.y, 6); p.vy = -p.vy; }
    }
    if (this.eco && t % 200 === 0 && this.creatures.length < FLOOR) {   // life starts again from the soup
      const w = this.soup.vocab[Math.floor(r() * this.soup.vocab.length)], seed = this.idea(w.slice(0, 3), 'seed');
      this.minted++; this.spawn('matcher', seed, ...this.somewhere(Math.floor(r() * this.nLands), 0.7));
    }
    if (this.eco && t % 1000 === 0) {   // a seed blows in if there is no tree; a frog turns up once there is enough to hunt
      const arrive = type => { const seed = this.idea(this.soup.virtues[Math.floor(r() * this.soup.virtues.length)], 'seed'); this.minted++; const c = this.spawn(type, seed, ...this.somewhere(Math.floor(r() * this.nLands), 0.7)); this.note(`a ${TYPES[type].name} arrived: #${c.id}`, 'species'); };
      // with no new kinds budding, a kind that has died out has to come back from outside: one of each kind the dish began with, and a few flies
      if (!this.mutate) for (const type of this.cast) { const n = this.creatures.filter(c => c.type === type).length; if (type === 'fly' ? this.circuit && n < 3 : type !== 'frog' && n < 1) arrive(type); }
      if (!this.creatures.some(c => c.type === 'frog') && this.creatures.filter(c => !TYPES[c.type].rooted).length >= 16) arrive('frog');   // trees do not count as something to hunt
    }
    if (this.webSeeds) {
      if (t % 20 === 0) this.tendWebs();
      if (t % WEB_GROW === 0) this.growWebs();
      if (t % 1000 === 500 && this.webs.length < 2) this.seedWeb();   // a seed takes wherever trees have nearly gone
    }
    for (const c of this.creatures) {
      if (c.gone) continue;
      if (t % PATH_EVERY === 0) c.path.push({ tick: t, x: c.x, y: c.y });
      if (c.state === 'trade') { if (c.job.lead) this.tradeTick(c); continue; }
      if (c.state === 'taste' && c.job.brain) this.flyThink(c);
      if (c.state === 'taste' && c.job.pending) { c.timer = Math.max(c.timer - 1, 1); continue; }   // waiting for the model
      if (c.state === 'sleep') c.dash = 0;   // asleep means still
      if (c.state !== 'roam') {
        if (--c.timer > 0) continue;
        if (c.state === 'taste') this.resolveTaste(c);
        c.state = 'roam'; c.job = null;
        continue;
      }
      if (c.station) {   // called home: go to its place and wait
        const dx = c.station[0] - c.x, dy = c.station[1] - c.y, d = Math.hypot(dx, dy);
        if (d < 6) { c.arrived = true; continue; }
        const v = Math.min(d, SPEED * c.pace * 2.5); c.x += dx / d * v; c.y += dy / d * v; c.heading = Math.atan2(dy, dx);
        continue;
      }
      if (c.life && t - c.born > c.life) { if (this.eco) { this.die(c, 'age'); this.note(`#${c.id} ${TYPES[c.type].name} died of age`, 'pod'); } else this.pupate(c); continue; }
      if (this.eco && c.body.length >= c.cap && t >= c.nextBud && this.creatures.length < ECO_CAP) this.bud(c);
      if (c.pendingCore) this.applyCore(c);
      if (t >= c.nextSleep) { c.nextSleep = t + SLEEP; c.nap = { start: t, doing: { learned: 'retraining its taste', forest: 'regrowing its trees', llm: 'asking the model what it is about' }[c.strategy] ?? 'settling what it holds' }; this.sleep(c); c.state = 'sleep'; c.timer = NAP; continue; }
      const T = TYPES[c.type];
      if ((t + c.id) % 10 === 0 && !T.hunter) this.retarget(c);
      const p = c.dash > 0 ? null : c.target;
      if (p) {
        const dx = wrap(p.x - c.x, W), dy = p.y - c.y;
        c.heading = Math.atan2(dy, dx);
        const d = Math.hypot(dx, dy);
        if (T.rooted && d < this.radius(c) + T.reach * 0.8) {   // a root reaches it from where the tree stands, and the tree grows to hold it
          if (c.body.length >= c.cap && c.cap < T.slots[1]) c.cap++;
          this.beginTaste(c, p); continue;
        }
        if (d < this.radius(c) * 0.95 + p.idea.size * 0.5) { this.beginTaste(c, p); continue; }
      } else if (c.dash <= 0) {
        c.heading += (r() - 0.5) * 0.12;
        if (this.eco && !T.rooted && (t + c.id) % 10 === 0) {   // nothing to taste: go after something it can swallow, or a tree to graze
          let prey = null, near = (T.hunter ? 2 : 1) * HUNT_RANGE + this.radius(c);
          for (const b of this.creatures) if (b !== c && !b.gone) {
            const d = Math.hypot(wrap(b.x - c.x, W), b.y - c.y) * (T.hunter && b.strategy === 'fly' ? 0.35 : 1);   // to a frog, a fly looks closer than it is
            if (d < near && (this.edible(c, b) || this.grazable(c, b))) { near = d; prey = b; }
          }
          c.prey = prey;
        }
        if (this.eco && c.prey && !c.prey.gone) {
          c.heading = Math.atan2(c.prey.y - c.y, wrap(c.prey.x - c.x, W));
          if (T.hunter && t >= (c.nextHop ?? 0) && Math.hypot(wrap(c.prey.x - c.x, W), c.prey.y - c.y) < 5 * this.radius(c)) { c.dash = 36; c.nextHop = t + 240; }   // a hop
        }
      }
      if ((this.map === 'scatter' || this.map === 'dish') && Math.hypot(c.x - W / 2, c.y - H / 2) > this.plate - this.radius(c) * 0.5) c.heading = Math.atan2(H / 2 - c.y, W / 2 - c.x);   // stay on the dish
      const v = SPEED * c.pace * (c.dash-- > 0 ? DASH_SPEED : 1) * (t < (c.slowUntil ?? 0) ? 0.45 : 1);
      c.x = (c.x + Math.cos(c.heading) * v + W) % W;
      c.y += Math.sin(c.heading) * v;
      const m = this.radius(c) * 0.6;   // turn back at the top and bottom edges
      if (c.y < m || c.y > H - m) { c.y = clampY(c.y, m); c.heading = -c.heading; }
    }
    this.contacts();
    if (this.eco) this.creatures = this.creatures.filter(c => !c.gone);
  }

  // Sensing sharpens with distance. From far off a creature makes out one word of an idea, closer
  // three, close up all of it, and it guesses the fit from that with its own sense. It heads for the
  // best guess, discounted by distance; if nothing looks promising it just tries whatever is nearest.
  // Only tasting gives the true score.
  see(c, p) {
    const T = TYPES[c.type], d = Math.max(0, Math.hypot(wrap(p.x - c.x, W), p.y - c.y) - this.radius(c)), f = d / T.reach;
    if (f > 1) return null;
    const level = f < T.acuity ? 3 : f < (1 + T.acuity) / 2 || T.headlines ? 2 : 1;
    // labels and meaning are not made of words, so those senses get the whole idea but fainter from afar
    if (c.strategy === 'tags' || c.strategy === 'embed') return { p, d, level, seen: p.idea, guess: this.judge(c, p.idea).score * [0.45, 0.75, 1][level - 1] };
    const seen = this.glimpse(p.idea, level);
    return { p, d, level, seen, guess: this.judge(c, seen).score };
  }
  retarget(c) {
    const T = TYPES[c.type];
    let best = null, bestU = 0.012, nearest = null;
    c.sensed = [];
    for (const p of this.particles) {
      if ((c.tasted.get(p.idea.id) ?? -1e9) > this.tick - MEMORY) continue;
      if (p.idea.pod && !(T.tier >= 2 && T.tier > p.idea.tier)) continue;
      const s = this.see(c, p);
      if (!s) continue;
      c.sensed.push(s);
      if (!c.looks.has(p.idea.id)) c.looks.set(p.idea.id, s);   // remember the first sight of each idea
      if (!nearest || s.d < nearest.d) nearest = s;
      const u = s.guess * (1 - 0.45 * s.d / T.reach);
      if (u > bestU) { bestU = u; best = s; }
    }
    const pick = best ?? nearest;
    // Once it has set off for an idea it keeps going. Seen from nearer, an idea can smell worse and another
    // better, and a creature that re-chose every time would turn back and forth between two for ever.
    const cur = c.target && c.sensed.find(s => s.p === c.target);
    if (cur && this.tick - (c.aimed ?? -1e9) < COMMIT) return;
    if (cur && pick?.p === c.target) { c.tasted.set(c.target.idea.id, this.tick); c.target = null; return; }   // it never got there: leave that one alone for a while
    if (pick?.p !== c.target) c.aimed = this.tick;
    c.target = pick?.p ?? null; c.aimWhy = best ? 'scent' : 'nearest';
    if (c.looks.size > 400) c.looks.clear();
  }

  // The idea is taken into the mouth and judged. The verdict is known at once but the creature
  // holds still for TASTE ticks so the working can be seen.
  beginTaste(c, p) {
    const i = this.particles.indexOf(p);
    c.target = null;
    if (i < 0) return;
    this.particles.splice(i, 1);
    const full = c.body.length >= c.cap, weak = full ? this.weakest(c) : null;
    const verdict = this.judge(c, p.idea);
    const threshold = full ? weak.value + MARGIN : TYPES[c.type].bar;   // a learner with room accepts anything
    const absorb = verdict.score > threshold;
    const aim = c.looks.get(p.idea.id) ?? null, guess = aim?.guess ?? verdict.score;
    c.looks.delete(p.idea.id);
    const surprise = Math.abs(verdict.score - guess);
    c.surprise = c.surprise * 0.9 + surprise * 0.1;
    const total = TYPES[c.type].chew;
    c.job = { kind: 'taste', idea: p.idea, ...verdict, threshold, absorb, full, expel: absorb && full ? weak.idea : null,
      weakValue: weak?.value, weak: weak?.idea, angle: c.heading, total, guess, surprise,
      glimpsed: aim && aim.seen !== p.idea ? aim.seen.text : null, sawFrom: aim ? Math.round(aim.d) : 0, why: c.aimWhy ?? 'nearest' };
    c.state = 'taste'; c.timer = total;
    if (c.brain) {
      // the tongue: fit becomes sweetness, centred so that an idea right at the bar is a coin-flip
      const sugar = Math.max(0, Math.min(1, 0.35 + (verdict.score - threshold) / 0.08));
      Object.assign(c.job, { brain: true, sugar, loom: 0, mn9: 0, gf: 0, base: { mn9: c.brain.out.MN9.count, gfL: c.brain.out.DNp01_L.count, gfR: c.brain.out.DNp01_R.count } });
    } else if (c.strategy === 'llm' && !this.oracle) c.job.fallback = true;
    else if (c.strategy === 'llm' && c.body.length >= 5) this.ask(c);
    else if (c.strategy === 'llm') Object.assign(c.job, { absorb: true, threshold: -1 });   // its first few ideas it simply collects
  }

  // Run the fly's brain for this tick's share of the 300 ms it gets to decide.
  flyThink(c) {
    const j = c.job, b = c.brain, R = this.radius(c);
    let L = 0, Rt = 0;
    for (const o of this.creatures) {
      if (o === c || o.state !== 'roam') continue;
      const dx = wrap(o.x - c.x, W), dy = o.y - c.y, d = Math.hypot(dx, dy), gap = d - R - this.radius(o);
      const closing = -(Math.cos(o.heading) * dx + Math.sin(o.heading) * dy) / (d || 1);
      if (gap > 120 || closing <= 0.3) continue;
      const I = Math.min(1, (1 - gap / 120) * closing * 1.3), side = Math.sin(Math.atan2(dy, dx) - c.heading);
      L = Math.max(L, I * (side < 0 ? 1 : 0.4)); Rt = Math.max(Rt, I * (side >= 0 ? 1 : 0.4));
    }
    j.loom = Math.max(L, Rt);
    b.setRate('sugar', 170 * j.sugar); b.setRate('loomL', 150 * L); b.setRate('loomR', 150 * Rt);
    b.step(FLY_MS / j.total);
    j.mn9 = b.out.MN9.count - j.base.mn9;
    j.gf = Math.max(b.out.DNp01_L.count - j.base.gfL, b.out.DNp01_R.count - j.base.gfR);
    j.flashes = b.flash;
    for (let i = 0; i < b.flash.length; i++) b.flash[i] *= 0.8;
  }

  // Ask the language model. Asked to rate an idea, small models approve of everything, so the
  // question is a forced choice: of its eight loosest-fitting body ideas plus the new one, which
  // belongs least? If it names the new idea, pass; otherwise absorb, giving up the one named if full. The creature holds the idea in its
  // mouth until the answer comes.
  ask(c) {
    // only its eight loosest-fitting ideas go into the question, which keeps the prompt short however large it grows
    const j = c.job, list = [...c.body].sort((a, b) => this.fit(c, a) - this.fit(c, b)).slice(0, 8), at = Math.floor(this.rand() * (list.length + 1));
    list.splice(at, 0, j.idea);
    j.pending = true; j.asked = this.tick;
    this.oracle('least', { core: c.core.map(i => i.text), list: list.map(i => i.text) }).then(a => {
      if (c.job !== j) return;
      const out = list[Math.round(+a.least) - 1];
      if (!out) throw new Error('no choice');
      j.llm = { why: String(a.why ?? '').slice(0, 80), model: a.model, out, list, probs: a.probs ? list.map((_, i) => a.probs[i + 1] ?? 0) : null };
      j.absorb = out !== j.idea; j.expel = j.absorb && j.full ? out : null;   // with room to spare it keeps both
    }).catch(() => { if (c.job === j) j.fallback = true; }).finally(() => { if (c.job === j) j.pending = false; });
  }

  resolveTaste(c) {
    // An idea leaving a cell is thrown clear of it, and remembers who let it go (for the viewer).
    const j = c.job, out = (idea, a, kind) => {
      const R = this.radius(c) + 10, v = kind === 'expel' ? 1.5 : 0.6;
      const p = this.drop(idea, c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, Math.cos(a) * v, Math.sin(a) * v);
      p.ejected = { tick: this.tick, by: c.id, kind, x: c.x, y: c.y };
      c.tasted.set(idea.id, this.tick);
    };
    if (j.brain) {   // the connectome has the last word
      j.fled = j.gf >= GF_FLEES;
      j.absorb = !j.fled && j.mn9 >= MN9_EATS;
      j.expel = j.absorb && j.full ? j.weak : null;
      j.flashes = null; c.brain.flash.fill(0);
      // it bolts about five body-lengths, so a bigger fly dashes further
      if (j.fled) { c.dash = Math.round(DASH_LENGTHS * 2 * this.radius(c) / (SPEED * c.pace * DASH_SPEED)); c.heading = j.angle + Math.PI + (this.rand() - 0.5); }
    }
    // taking in a whole pod stretches a creature that still has room to grow: nothing is expelled
    if (j.absorb && j.idea.pod && c.cap < TYPES[c.type].slots[1]) { c.cap++; j.expel = null; j.grew = c.cap; }
    if (j.absorb) {
      if (j.expel) {
        c.body.splice(c.body.indexOf(j.expel), 1);
        out(j.expel, j.angle + Math.PI, 'expel');
        if (c.strategy === 'learned' || c.strategy === 'forest') c.dropped.push(j.expel);
      }
      c.body.push(j.idea);
      this.counts.absorbed++;
      if (j.idea.pod) { this.pods.eaten++; this.note(`#${c.id} ${TYPES[c.type].name} absorbed the pod "${j.idea.label}"`, 'pod'); }
    } else { out(j.idea, j.angle + 2.2, 'pass'); this.counts.passed++; }
    this.record(c, j);
  }

  // Sleep is when the slow layer changes. Learners retrain first.
  sleep(c) {
    const nap = c.nap ??= { start: this.tick };
    if (!c.life && ++c.sleeps % 2 === 0 && c.cap < TYPES[c.type].slots[1]) { c.cap++; nap.grew = c.cap; }   // the undying grow with age
    if (c.strategy === 'learned') this.train(c);
    if (c.strategy === 'forest') this.grow(c);
    // how well each held idea sits with the rest: this is what sleep works from
    nap.fits = this.held(c).map(i => ({ idea: i, fit: this.fit(c, i), core: c.core.includes(i) }));
    if (!c.body.length) { nap.outcome = 'nothing in the body to consider'; return; }
    if (c.strategy === 'llm' && this.oracle && c.core.length + c.body.length > CORE_SLOTS) { nap.outcome = 'asked the model which three ideas say what it is about'; nap.asked = true; return this.askCore(c); }
    let cand = null, candFit = 0;
    for (const b of c.body) { const v = this.fit(c, b); if (v > candFit) { candFit = v; cand = b; } }
    if (!cand) { nap.outcome = 'no body idea fits the rest at all'; return; }
    Object.assign(nap, { cand, candFit });
    let demoted = null;
    if (c.core.length < CORE_SLOTS) { c.body.splice(c.body.indexOf(cand), 1); c.core.push(cand); nap.outcome = 'an empty core slot was filled by the best-fitting body idea'; }
    else {
      let weakFit = Infinity;
      for (const d of c.core) { if ((this.quest || c.query) && d === c.seed) continue; const v = this.fit(c, d); if (v < weakFit) { weakFit = v; demoted = d; } }   // a searcher keeps what it was sent with
      Object.assign(nap, { weak: demoted, weakFit });
      if (c.temper !== 'open') { nap.outcome = 'its core is fixed, so nothing changes'; return; }
      if (candFit <= weakFit + MARGIN) { nap.outcome = `best body idea ${candFit.toFixed(2)} does not beat weakest core ${weakFit.toFixed(2)} + ${MARGIN}: no change`; return; }
      c.core[c.core.indexOf(demoted)] = cand; c.body[c.body.indexOf(cand)] = demoted;
      nap.outcome = `best body idea ${candFit.toFixed(2)} beats weakest core ${weakFit.toFixed(2)} + ${MARGIN}: they change places`;
    }
    c.coreChanges++; this.counts.coreChanges++;
    Object.assign(nap, { promoted: cand, demoted });
    this.record(c, { kind: 'core', promoted: cand, demoted, fit: candFit, nap });
    this.note(`#${c.id} core ← "${short(cand.text)}"`, 'core');
  }

  // A Librarian chooses its own nucleus: the three ideas that say what the collection is about.
  // The answer can arrive while it is busy, so it is kept and applied the next time it is roaming.
  askCore(c) {
    const held = this.held(c);
    this.oracle('core', { ideas: held.map(i => i.text) }).then(a => {
      const pick = [...new Set((a.keep || []).map(n => held[Math.round(+n) - 1]))].filter(Boolean).slice(0, CORE_SLOTS);
      if (pick.length === CORE_SLOTS) c.pendingCore = { pick, why: String(a.why ?? '').slice(0, 80) };
      if (c.nap) c.nap.answer = { keep: pick, why: String(a.why ?? '').slice(0, 80), model: a.model };
    }).catch(() => {});
  }
  applyCore(c) {
    const { pick, why } = c.pendingCore, all = this.held(c), before = c.core;
    c.pendingCore = null;
    if (!pick.every(i => all.includes(i)) || pick.every(i => before.includes(i))) return;
    c.core = pick; c.body = all.filter(i => !pick.includes(i));
    c.coreChanges++; this.counts.coreChanges++;
    const promoted = pick.find(i => !before.includes(i));
    this.record(c, { kind: 'core', promoted, demoted: before.find(i => !pick.includes(i)) ?? null, why, nap: c.nap });
    this.note(`#${c.id} core ← "${short(promoted.text)}"`, 'core');
  }

  // Forest: remember what sat well and what did not, then regrow every tree from that memory.
  grow(c) {
    if (c.body.length < 2) return;
    const fits = c.body.map(b => this.fit(c, b)), bar = Math.max(...fits) * 0.6;
    c.body.forEach((b, i) => c.memory.push([new Set(this.cues(b)), fits[i] > 0 && fits[i] >= bar ? 1 : 0]));
    for (const b of c.dropped) c.memory.push([new Set(this.cues(b)), 0]);
    c.dropped = []; c.memory = c.memory.slice(-60);
    const r = this.rand, build = (rows, depth) => {
      const p = rows.reduce((s, x) => s + x[1], 0) / rows.length;
      if (depth === 0 || rows.length < 4 || p === 0 || p === 1) return { p };
      const pool = [...new Set(rows.flatMap(x => [...x[0]]))], gini = q => 2 * q * (1 - q);
      let best = null, bestScore = gini(p) - 1e-6;
      for (let k = 0; k < 14 && pool.length; k++) {
        const cue = pool[Math.floor(r() * pool.length)], yes = rows.filter(x => x[0].has(cue)), no = rows.filter(x => !x[0].has(cue));
        if (!yes.length || !no.length) continue;
        const mean1 = l => l.reduce((s, x) => s + x[1], 0) / l.length;
        const score = (yes.length * gini(mean1(yes)) + no.length * gini(mean1(no))) / rows.length;
        if (score < bestScore) { bestScore = score; best = { cue, yes, no }; }
      }
      return best ? { cue: best.cue, yes: build(best.yes, depth - 1), no: build(best.no, depth - 1) } : { p };
    };
    c.trees = Array.from({ length: 12 }, () => build(c.memory.map(() => c.memory[Math.floor(r() * c.memory.length)]), 3));
    if (c.nap) c.nap.forest = { remembered: c.memory.length, good: c.memory.filter(m => m[1]).length, trees: c.trees.length };
  }

  // Good examples: body ideas that fit at least 60% as well as the best one. Bad: the rest, and
  // everything dropped since the last sleep.
  train(c) {
    if (c.body.length < 2) return;
    const fits = c.body.map(b => this.fit(c, b)), bar = Math.max(...fits) * 0.6;
    const examples = c.body.map((b, i) => [b, fits[i] > 0 && fits[i] >= bar ? 1 : 0]).concat(c.dropped.map(b => [b, 0]));
    const before = new Map(c.weights);
    for (const [q, v] of c.weights) c.weights.set(q, v * 0.97);   // slow forgetting
    for (let pass = 0; pass < 4; pass++) for (const [idea, label] of examples) {
      const cues = this.cues(idea), step = 0.4 * (label - (this.judge(c, idea).score + 0.5));
      c.bias += step * 0.1;
      for (const q of cues) c.weights.set(q, (c.weights.get(q) ?? 0) + step / Math.sqrt(cues.length));
    }
    if (c.nap) c.nap.train = { good: examples.filter(e => e[1]).length, poor: examples.filter(e => !e[1]).length, weights: c.weights.size,
      changes: [...c.weights].map(([q, v]) => ({ cue: q, from: before.get(q) ?? 0, to: v })).sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from)).slice(0, 9) };
    c.dropped = [];
  }

  // Cells do not overlap. When two roaming cells touch, they stop and consider a trade.
  contacts() {
    const cs = this.creatures, t = this.tick;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      const dx = wrap(a.x - b.x, W), dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      const gap = this.radius(a) + this.radius(b) - d;
      if (a.station || b.station) { if (gap > 0 && !a.arrived && !b.arrived) { a.x += dx / d * gap * 0.5; a.y += dy / d * gap * 0.5; b.x -= dx / d * gap * 0.5; b.y -= dy / d * gap * 0.5; } continue; }   // called home: no more meetings
      if (this.eco) {
        if (a.gone || b.gone) continue;
        const ok = x => x.state === 'roam' || x.state === 'sleep';
        if (gap > -6 && this.grazable(a, b)) { this.graze(a, b); continue; }
        if (gap > -6 && this.grazable(b, a)) { this.graze(b, a); continue; }
        if (gap > -6 && a.state === 'roam' && ok(b) && this.edible(a, b)) { this.eat(a, b); continue; }
        if (gap > -6 && b.state === 'roam' && ok(a) && this.edible(b, a)) { this.eat(b, a); continue; }
      }
      // two cells that come near each other stop to trade; they need not touch
      const apart = TYPES[a.type].apart || TYPES[b.type].apart;   // trees and frogs do not trade
      if (!apart && gap > -MEET_RANGE && gap <= 0 && a.state === 'roam' && b.state === 'roam' && t - a.lastMeet >= MEET_COOLDOWN && t - b.lastMeet >= MEET_COOLDOWN
        && t - (this.pairMet.get(`${a.id}|${b.id}`) ?? -1e9) >= PAIR_COOLDOWN) { this.beginTrade(a, b); continue; }
      if (gap <= 0) continue;
      // a sleeping cell is not shoved aside: whoever is awake gives way entirely
      const still = x => x.state === 'sleep' || TYPES[x.type].rooted;   // a tree is not shoved aside either
      const fa = still(a) ? 0 : still(b) ? 1 : 0.5, fb = still(a) && still(b) ? 0 : 1 - fa;
      const px = dx / d * gap, py = dy / d * gap;
      a.x = (a.x + px * fa + W) % W; a.y = clampY(a.y + py * fa); b.x = (b.x - px * fb + W) % W; b.y = clampY(b.y - py * fb);
      if (apart || a.state !== 'roam' || b.state !== 'roam') continue;
      // each cell rests after a meeting, and the same two do not meet again for a long while
      if (t - a.lastMeet < MEET_COOLDOWN || t - b.lastMeet < MEET_COOLDOWN) continue;
      if (t - (this.pairMet.get(`${a.id}|${b.id}`) ?? -1e9) < PAIR_COOLDOWN) continue;
      this.beginTrade(a, b);
    }
  }

  // Trade: a meeting of up to TRADE_ROUNDS exchanges. Each round both cells look for the one swap
  // of body ideas that leaves both better off by their own lights, show it for ROUND ticks, then
  // make it. The meeting ends at the first round where no such swap exists.
  offer(a, b) {
    let best = null, gain = 0;
    for (const ia of a.body) {
      const lossA = this.want(a, ia, ia), gainB = this.want(b, ia);
      for (const ib of b.body) {
        const ga = this.want(a, ib, ia) - lossA, gb = gainB - this.want(b, ib, ib);
        if (ga > 0 && gb > 0 && ga + gb > gain) { gain = ga + gb; best = { ia, ib, ga, gb }; }
      }
    }
    return best;
  }

  beginTrade(a, b, round = 1) {
    const o = this.offer(a, b);
    a.job = { kind: 'trade', partner: b, lead: true, round, gives: o?.ia, gets: o?.ib, gain: o?.ga, theirGain: o?.gb };
    b.job = { kind: 'trade', partner: a, lead: false, round, gives: o?.ib, gets: o?.ia, gain: o?.gb, theirGain: o?.ga };
    a.state = b.state = 'trade'; a.target = b.target = null;
    a.timer = b.timer = o ? ROUND : ROUND / 2;
  }

  // driven by the lead cell so both sides move in step
  tradeTick(a) {
    const b = a.job.partner;
    b.timer = --a.timer;
    if (a.timer > 0) return;
    const swapped = !!a.job.gives;
    for (const c of [a, b]) {
      const j = c.job;
      if (swapped) c.body[c.body.indexOf(j.gives)] = j.gets;
      if (swapped || j.round === 1) this.record(c, { kind: 'trade', partner: j.partner.id, round: j.round, gives: j.gives, gets: j.gets, gain: j.gain, theirGain: j.theirGain });
    }
    if (swapped) {
      this.counts.trades++;
      if (a.job.round < TRADE_ROUNDS) return this.beginTrade(a, b, a.job.round + 1);
    }
    for (const c of [a, b]) { c.state = 'roam'; c.job = null; c.lastMeet = this.tick; }
    this.pairMet.set(`${a.id}|${b.id}`, this.tick);
  }

  // Feed a block of text. Each sentence becomes an idea; they land together as a clump. Words that
  // shared a sentence (or just the block) become linked, so the soup learns what goes together.
  feed(block) {
    const texts = block.text.split(/(?<=[.!?])\s+/).map(s => s.trim().replace(/[.]$/, '')).filter(Boolean);
    const ideas = texts.map(t => this.idea(t, block.title, block.id));
    const all = [...new Set(ideas.flatMap(i => i.words))];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) this.aff.link(all[i], all[j], 0.25);
    for (const { words: s } of ideas) for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) this.aff.link(s[i], s[j], 0.5);
    this.kinTable.fill(NaN); this.affVersion++; this.kinOf = null;   // associations changed
    // fed ideas arrive at the centre and wind outward in a spiral
    const In = this.lands[this.nLands];
    for (const idea of ideas) {
      const k = In.fedCount++;
      idea.home = this.nLands; idea.slot = { land: this.nLands, r: 34 + 9 * Math.sqrt(k) * 3, a: k * 2.4, w: 0.0012, ring: 0 };
      In.r = Math.max(In.r, idea.slot.r + 30);
      this.drop(idea, In.x, In.y);
    }
    this.fed.push({ id: block.id, title: block.title, tick: this.tick, n: ideas.length });
    this.note(`fed "${block.title}" (${ideas.length} ideas)`, 'feed');
    return ideas.length;
  }

  // Per-template summary for the organisms panel and the experiments.
  typeStats() {
    const out = {};
    for (const c of this.creatures) {
      const s = out[c.type] ??= { n: 0, surprise: 0, coherence: 0, kinCoherence: 0, coreChanges: 0, seedKept: 0, fedHeld: 0, absorbed: 0, passed: 0 };
      s.n++; s.coherence += this.coherence(c); s.kinCoherence += this.coherence(c, this.aff.kin);
      s.surprise += c.surprise; s.coreChanges += c.coreChanges; s.seedKept += c.core.includes(c.seed) ? 1 : 0;
      s.fedHeld += this.held(c).filter(i => i.block).length;
      for (const e of c.events) if (e.kind === 'taste') e.absorb ? s.absorbed++ : s.passed++;
    }
    for (const s of Object.values(out)) { s.coherence /= s.n; s.kinCoherence /= s.n; s.surprise /= s.n; }
    return out;
  }

  note(text, kind) {
    this.log.push({ tick: this.tick, text, kind });
    if (this.log.length > 200) this.log.shift();
  }

  metrics() {
    const cs = this.creatures;
    return { tick: this.tick, soup: this.particles.length, coherence: mean(cs.map(c => this.coherence(c))),
      full: cs.filter(c => c.body.length >= c.cap).length, ...this.counts, pods: this.pods,
      podsAdrift: this.particles.filter(p => p.idea.pod).length,
      deepest: Math.max(0, ...this.particles.map(p => p.idea.depth ?? 0), ...cs.flatMap(c => this.held(c).map(i => i.depth ?? 0))) };
  }
}

export const short = (text, n = 30) => text.length > n ? text.slice(0, n - 1).trimEnd() + '…' : text;

export const PRESETS = {
  'The full ladder': Object.keys(TYPES).filter(k => !TYPES[k].apart).map(type => ({ n: 1, type })),
  // rows by tier: 8, 4, 2, 2, 1. Sized so the creatures together cannot hold the whole of a small soup.
  'Pyramid': [{ n: 8, type: 'matcher' }, { n: 2, type: 'forager' }, { n: 1, type: 'empath' }, { n: 1, type: 'keeper' },
    { n: 1, type: 'learner' }, { n: 1, type: 'forest' }, { n: 1, type: 'fly' }, { n: 1, type: 'seer' }, { n: 1, type: 'llm' }],
  'Three tiers': [{ n: 2, type: 'matcher' }, { n: 2, type: 'forager' }, { n: 2, type: 'learner' }],
  'Rule creatures': [{ n: 2, type: 'matcher' }, { n: 2, type: 'forager' }, { n: 2, type: 'empath' }, { n: 2, type: 'keeper' }],
  'Three senses': [{ n: 2, type: 'forager' }, { n: 2, type: 'empath' }, { n: 2, type: 'seer' }],
  'Learned taste': [{ n: 3, type: 'learner' }, { n: 3, type: 'forest' }],
  'Flies': [{ n: 5, type: 'fly' }, { n: 2, type: 'forager' }],
  'Menagerie': [...Object.keys(TYPES).filter(k => !TYPES[k].apart).map(type => ({ n: 1, type })), { n: 1, type: 'frog' }],   // one of every kind, as an ecosystem: the Second brain page
  'Pond': [{ n: 8, type: 'matcher' }, { n: 6, type: 'fly' }],   // with trees growing as webs and a frog arriving: the Ecosystem page
  'Primordial': [{ n: 8, type: 'matcher' }],
  'Search party': [{ n: 2, type: 'forager' }, { n: 2, type: 'seer' }, { n: 1, type: 'keeper' }, { n: 1, type: 'learner' }],
  'Giants and minnows': [{ n: 6, type: 'matcher' }, { n: 2, type: 'seer' }, { n: 1, type: 'llm' }],
};
