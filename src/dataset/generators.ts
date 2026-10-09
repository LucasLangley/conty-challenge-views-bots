import { HOUR_MS, saoPauloHours } from "../domain/time.ts";
import { integer, logUniform, normal, pick, poisson, uniform, type Rng } from "./prng.ts";

// Fração do movimento do horário nobre (20h-21h) em cada hora de São Paulo.
// Hipótese do gerador, não medida de rede social real.
export const PERFIL_SAO_PAULO = [
  0.7, 0.5, 0.35, 0.25, 0.2, 0.2, 0.25, 0.35, 0.45, 0.55, 0.6, 0.65, 0.75, 0.75, 0.7, 0.7, 0.72, 0.78, 0.85, 0.92, 1, 1,
  0.95, 0.85,
];

// Segunda-feira, 00h em São Paulo.
const BASE_START = Date.parse("2026-09-07T03:00:00.000Z");

export type Truth = "legitimo" | "suspeito";

export type Frame = { rng: Rng; hours: number; startAt: Date; sp: number[] };

export type Generator = {
  name: string;
  truth: Truth;
  limitrofe: boolean;
  descricao: string;
  build: (f: Frame) => number[];
};

export function frame(rng: Rng, hours = integer(rng, 96, 336), startAt?: Date): Frame {
  const start = startAt ?? new Date(BASE_START + integer(rng, 0, 24 * 28) * HOUR_MS);
  return { rng, hours, startAt: start, sp: saoPauloHours(start, hours) };
}

function circadian(hour: number, amplitude: number): number {
  return 1 - amplitude + amplitude * PERFIL_SAO_PAULO[hour];
}

// Views esperadas de público humano; `level` é o movimento no horário nobre.
export function human(f: Frame, level: number, opts: { amplitude?: number; growth?: number } = {}): number[] {
  const amplitude = opts.amplitude ?? 1;
  const growth = opts.growth ?? 1;
  const daily = Array.from({ length: Math.ceil(f.hours / 24) }, () => Math.exp(0.08 * normal(f.rng)));
  return f.sp.map((h, t) => level * growth ** (t / f.hours) * daily[Math.floor(t / 24)] * circadian(h, amplitude));
}

// Vídeo que estourou: sobe em `riseHours`, decai com meia-vida `halfLife`, e segue o dia e a noite.
export function addViral(
  f: Frame,
  rates: number[],
  opts: { at: number; amplitude: number; riseHours: number; halfLife: number; circadianAmplitude?: number },
): number[] {
  const amp = opts.circadianAmplitude ?? 1;
  return rates.map((r, t) => {
    const k = t - opts.at;
    if (k < 0) return r;
    const shape = k < opts.riseHours ? (k + 1) / opts.riseHours : 2 ** (-(k - opts.riseHours + 1) / opts.halfLife);
    return r + opts.amplitude * shape * circadian(f.sp[t], amp);
  });
}

// Público humano: ruído multiplicativo (sobredispersão) + contagem de Poisson.
export function noisy(f: Frame, rates: number[], sigma: number): number[] {
  return rates.map((r) => poisson(f.rng, r * Math.exp(sigma * normal(f.rng))));
}

// Tráfego comprado: nível fixo (ou seguindo `shape`), com pouco ruído, ligado e desligado.
export function bots(
  f: Frame,
  opts: { from: number; hours: number; level: number; jitter: number; shape?: (t: number) => number },
): number[] {
  return Array.from({ length: f.hours }, (_, t) => {
    if (t < opts.from || t >= opts.from + opts.hours) return 0;
    const shape = opts.shape ? opts.shape(t) : 1;
    return Math.max(0, Math.round(opts.level * shape * (1 + opts.jitter * normal(f.rng))));
  });
}

export function sum(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}

function sigma(f: Frame): number {
  return uniform(f.rng, 0.08, 0.18);
}

function viralOpts(f: Frame, level: number) {
  return {
    at: integer(f.rng, 24, f.hours - 48),
    amplitude: uniform(f.rng, 5, 40) * level,
    riseHours: integer(f.rng, 1, 3),
    halfLife: uniform(f.rng, 4, 36),
  };
}

// Hora da série entre `min` e `max` que cai entre `de` e `ate` em São Paulo.
function startAtHour(f: Frame, de: number, ate: number, min: number, max: number): number {
  const candidates = f.sp.map((h, t) => (h >= de && h <= ate && t >= min && t <= max ? t : -1)).filter((t) => t >= 0);
  return candidates.length > 0 ? pick(f.rng, candidates) : integer(f.rng, min, max);
}

function madrugadaStart(f: Frame, min: number, max: number): number {
  return startAtHour(f, 0, 3, min, max);
}

export const GENERATORS: Generator[] = [
  {
    name: "organico_estavel",
    truth: "legitimo",
    limitrofe: false,
    descricao: "público no Brasil, ritmo de dia e noite, ruído de contagem",
    build: (f) => noisy(f, human(f, logUniform(f.rng, 40, 5000)), sigma(f)),
  },
  {
    name: "viral_organico",
    truth: "legitimo",
    limitrofe: false,
    descricao: "pico de 5× a 40× que sobe em 1-3 h e decai com meia-vida de 4-36 h",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      return noisy(f, addViral(f, human(f, level), viralOpts(f, level)), sigma(f));
    },
  },
  {
    name: "crescimento_lento",
    truth: "legitimo",
    limitrofe: false,
    descricao: "audiência que cresce 2× a 6× ao longo da série",
    build: (f) => noisy(f, human(f, logUniform(f.rng, 30, 1000), { growth: uniform(f.rng, 2, 6) }), sigma(f)),
  },
  {
    name: "viral_rapido",
    truth: "legitimo",
    limitrofe: true,
    descricao: "pico orgânico que decai rápido (meia-vida de 1,5-3 h)",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const opts = { ...viralOpts(f, level), riseHours: integer(f.rng, 1, 2), halfLife: uniform(f.rng, 1.5, 3) };
      return noisy(f, addViral(f, human(f, level), opts), sigma(f));
    },
  },
  {
    name: "audiencia_global",
    truth: "legitimo",
    limitrofe: true,
    descricao: "público espalhado em vários fusos: dia e noite bem mais achatados",
    build: (f) => {
      const level = logUniform(f.rng, 40, 3000);
      let rates = human(f, level, { amplitude: 0.4 });
      if (f.rng() < 0.5) rates = addViral(f, rates, { ...viralOpts(f, level), circadianAmplitude: 0.4 });
      return noisy(f, rates, uniform(f.rng, 0.1, 0.18));
    },
  },
  {
    name: "baixo_volume",
    truth: "legitimo",
    limitrofe: true,
    descricao: "criador pequeno: 2 a 25 views/h no horário nobre",
    build: (f) => {
      const level = uniform(f.rng, 2, 25);
      let rates = human(f, level);
      if (f.rng() < 0.3) rates = addViral(f, rates, viralOpts(f, level));
      return noisy(f, rates, uniform(f.rng, 0.1, 0.2));
    },
  },
  {
    name: "video_removido",
    truth: "legitimo",
    limitrofe: true,
    descricao: "vídeo viral que é removido ou arquivado: as views caem para quase zero",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const opts = viralOpts(f, level);
      const cutAt = Math.min(f.hours - 12, opts.at + opts.riseHours + integer(f.rng, 0, 30));
      const residual = uniform(f.rng, 0, 0.02) * level;
      const rates = addViral(f, human(f, level), opts).map((r, t) => (t >= cutAt ? residual : r));
      return noisy(f, rates, sigma(f));
    },
  },
  {
    name: "viral_cortado",
    truth: "legitimo",
    limitrofe: true,
    descricao: "viral orgânico que sai da recomendação 2-6 h depois do topo: as views voltam de uma vez ao patamar de antes",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const opts = viralOpts(f, level);
      const cutAt = opts.at + opts.riseHours + integer(f.rng, 2, 6);
      const rates = human(f, level);
      const viral = addViral(f, rates, opts).map((r, t) => (t >= cutAt ? rates[t] : r));
      return noisy(f, viral, sigma(f));
    },
  },
  {
    name: "live_estreia",
    truth: "legitimo",
    limitrofe: true,
    descricao: "live ou estreia de 1-3 h começando entre 19h e 21h, de 5× a 30× o horário nobre: entra e sai de uma vez",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const hours = integer(f.rng, 1, 3);
      const from = startAtHour(f, 19, 21, 24, f.hours - hours - 24);
      const amplitude = uniform(f.rng, 5, 30) * level;
      const rates = human(f, level).map((r, t) => (t >= from && t < from + hours ? r + amplitude : r));
      return noisy(f, rates, sigma(f));
    },
  },
  {
    name: "pico_comprado",
    truth: "suspeito",
    limitrofe: false,
    descricao: "bloco de 3-12 h de 3× a 20× o horário nobre, nível fixo, metade na madrugada",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const hours = integer(f.rng, 3, 12);
      const from = f.rng() < 0.5 ? madrugadaStart(f, 24, f.hours - hours - 24) : integer(f.rng, 24, f.hours - hours - 24);
      const bought = bots(f, { from, hours, level: uniform(f.rng, 3, 20) * level, jitter: uniform(f.rng, 0.01, 0.04) });
      return sum(noisy(f, human(f, level), sigma(f)), bought);
    },
  },
  {
    name: "plato_bots",
    truth: "suspeito",
    limitrofe: false,
    descricao: "platô de 24-120 h de 1,5× a 6× o horário nobre, sem dia e noite",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const hours = integer(f.rng, 24, Math.min(120, f.hours - 48));
      const from = integer(f.rng, 12, f.hours - hours - 12);
      const bought = bots(f, { from, hours, level: uniform(f.rng, 1.5, 6) * level, jitter: uniform(f.rng, 0.01, 0.04) });
      return sum(noisy(f, human(f, level), sigma(f)), bought);
    },
  },
  {
    name: "repeticao_mecanica",
    truth: "suspeito",
    limitrofe: false,
    descricao: "conta só de bots: valor constante, ciclo exato repetido ou ruído mínimo",
    build: (f) => {
      const level = Math.round(logUniform(f.rng, 50, 3000));
      const variant = integer(f.rng, 0, 2);
      if (variant === 0) return Array.from({ length: f.hours }, () => level);
      if (variant === 1) {
        const period = pick(f.rng, [2, 3, 4, 6, 8, 12, 24]);
        const template = Array.from({ length: period }, () => Math.round(level * uniform(f.rng, 0.6, 1.4)));
        return Array.from({ length: f.hours }, (_, t) => template[t % period]);
      }
      return Array.from({ length: f.hours }, () => Math.round(level * (1 + 0.005 * normal(f.rng))));
    },
  },
  {
    name: "queda_abrupta",
    truth: "suspeito",
    limitrofe: false,
    descricao: "bots de 2× a 8× ligados no início e desligados de uma vez depois de 36 h ou mais",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const from = integer(f.rng, 0, 12);
      const hours = integer(f.rng, 36, f.hours - from - 36);
      const bought = bots(f, { from, hours, level: uniform(f.rng, 2, 8) * level, jitter: uniform(f.rng, 0.03, 0.06) });
      return sum(noisy(f, human(f, level), sigma(f)), bought);
    },
  },
  {
    name: "pico_comprado_pequeno",
    truth: "suspeito",
    limitrofe: true,
    descricao: "bloco curto (2-4 h) e baixo (1× a 2,5× o horário nobre)",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const hours = integer(f.rng, 2, 4);
      const from = integer(f.rng, 24, f.hours - hours - 24);
      const bought = bots(f, { from, hours, level: uniform(f.rng, 1, 2.5) * level, jitter: uniform(f.rng, 0.01, 0.04) });
      return sum(noisy(f, human(f, level), sigma(f)), bought);
    },
  },
  {
    name: "bots_imitando_ritmo",
    truth: "suspeito",
    limitrofe: true,
    descricao: "bots que seguem o dia e a noite, com ruído de 15% e rampa de 6 h na entrada e na saída",
    build: (f) => {
      const level = logUniform(f.rng, 30, 2000);
      const hours = integer(f.rng, 48, Math.min(120, f.hours - 24));
      const from = integer(f.rng, 12, f.hours - hours - 12);
      const ramp = (t: number) => Math.min(1, (t - from + 1) / 6, (from + hours - t) / 6);
      const bought = bots(f, {
        from,
        hours,
        level: uniform(f.rng, 1.5, 4) * level,
        jitter: 0.15,
        shape: (t) => ramp(t) * PERFIL_SAO_PAULO[f.sp[t]],
      });
      return sum(noisy(f, human(f, level), sigma(f)), bought);
    },
  },
];
