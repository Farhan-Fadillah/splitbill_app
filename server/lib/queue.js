// Antrian sederhana untuk membatasi jumlah scan yang berjalan bersamaan (melindungi kuota API & CPU).
export class Limiter {
  constructor(max = 2) { this.max = max; this.active = 0; this.waiting = []; }
  async run(fn) {
    if (this.active >= this.max) await new Promise((r) => this.waiting.push(r));
    this.active++;
    try { return await fn(); }
    finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
  get pending() { return this.waiting.length; }
}
