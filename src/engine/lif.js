// Leaky integrate-and-fire network. Same update rule and constants as tools/brain.py
// (Shiu et al. 2024): dv/dt = (g - v)/tau_m, dg/dt = -g/tau_g, spike -> g_post += w after a delay.
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LIF {
  constructor(c, rng) {
    const n = (this.n = c.n), p = c.params, m = c.pre.length;
    this.rng = rng;
    this.dt = 0.1;
    this.kv = this.dt / p.tau_m; this.kg = this.dt / p.tau_g; this.thr = p.thr;
    this.rfc = Math.round(p.refrac / this.dt); this.dly = Math.round(p.delay / this.dt);
    const ptr = (this.ptr = new Int32Array(n + 1));
    for (let i = 0; i < m; i++) ptr[c.pre[i] + 1]++;
    for (let i = 0; i < n; i++) ptr[i + 1] += ptr[i];
    const cur = ptr.slice(0, n);
    this.idx = new Int32Array(m); this.wt = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const k = cur[c.pre[i]]++;
      this.idx[k] = c.post[i]; this.wt[k] = c.w[i] * p.w_syn;
    }
    this.v = new Float32Array(n); this.g = new Float32Array(n);
    this.ref = new Int16Array(n); this.buf = new Float32Array(this.dly * n);
    this.pIn = new Float32Array(n);      // per-step Poisson spike probability; >0 marks a driven sensory neuron
    this.flash = new Float32Array(n);    // for display only
    this.inputs = {};
    for (const k in c.inputs) this.inputs[k] = Int32Array.from(c.inputs[k]);
    this.out = {}; this.outOf = new Int16Array(n).fill(-1); this.outList = [];
    for (const k in c.outputs) {
      const o = { name: k, size: c.outputs[k].length, rate: 0, count: 0 };
      for (const i of c.outputs[k]) this.outOf[i] = this.outList.length;
      this.out[k] = o; this.outList.push(o);
    }
    this.slot = 0; this.spikes = 0; this.tauRate = 120;
  }

  setRate(group, hz) {
    const p = (hz * this.dt) / 1000;
    for (const i of this.inputs[group]) this.pIn[i] = p;
  }

  fire(i, base) {
    const { ptr, idx, wt, buf } = this;
    for (let k = ptr[i], e = ptr[i + 1]; k < e; k++) buf[base + idx[k]] += wt[k];
    this.flash[i] = 1; this.spikes++;
    const o = this.outOf[i];
    if (o >= 0) { const g = this.outList[o]; g.count++; g.rate += 1000 / (this.tauRate * g.size); }
  }

  step(ms) {
    const { n, v, g, ref, buf, pIn, kv, kg, thr, rfc, dly, rng } = this;
    const steps = Math.round(ms / this.dt);
    const decay = Math.exp(-ms / this.tauRate);
    for (const o of this.outList) o.rate *= decay;
    for (let s = 0; s < steps; s++) {
      const base = this.slot * n;
      for (let i = 0; i < n; i++) {
        let gi = g[i] + buf[base + i];
        buf[base + i] = 0;
        if (ref[i] > 0) { ref[i]--; g[i] = gi; continue; }
        const vi = v[i] + (gi - v[i]) * kv;
        gi -= gi * kg;
        if (vi > thr && pIn[i] === 0) { v[i] = 0; g[i] = 0; ref[i] = rfc; ref[i] |= 0x4000; }
        else { v[i] = vi; g[i] = gi; }
      }
      // spikes land in the slot just cleared, i.e. `dly` steps from now
      for (let i = 0; i < n; i++) {
        if (ref[i] & 0x4000) { ref[i] &= 0x3fff; this.fire(i, base); }
        else if (pIn[i] > 0 && rng() < pIn[i]) this.fire(i, base);
      }
      this.slot = (this.slot + 1) % dly;
    }
  }
}
