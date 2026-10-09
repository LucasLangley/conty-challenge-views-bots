export type Rng = () => number;

// mulberry32: PRNG de 32 bits, determinístico para a mesma seed.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: cada série tem a própria seed, derivada de (seed, gerador, índice).
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join(":")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function integer(rng: Rng, min: number, max: number): number {
  return Math.min(max, Math.floor(uniform(rng, min, max + 1)));
}

export function logUniform(rng: Rng, min: number, max: number): number {
  return Math.exp(uniform(rng, Math.log(min), Math.log(max)));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[integer(rng, 0, items.length - 1)];
}

export function normal(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda >= 50) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}
