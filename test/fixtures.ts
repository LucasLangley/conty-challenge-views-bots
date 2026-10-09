import { addViral, bots, frame, human, noisy, sum } from "../src/dataset/generators.ts";
import { mulberry32 } from "../src/dataset/prng.ts";

// Segunda-feira, 00h em São Paulo. Sete dias de série.
export const START = new Date("2026-09-07T03:00:00.000Z");
const HOURS = 168;

function base(seed: number, level = 300, amplitude = 1) {
  const f = frame(mulberry32(seed), HOURS, START);
  return { f, rates: human(f, level, { amplitude }) };
}

// Vídeo que estourou na quinta às 18h: sobe em 2 h, meia-vida de 10 h, segue o dia e a noite.
export function viralOrganico(): number[] {
  const { f, rates } = base(7);
  return noisy(f, addViral(f, rates, { at: 90, amplitude: 3000, riseHours: 2, halfLife: 10 }), 0.1);
}

// Mesmo público, mesma seed: 6 h de bots a ~2.600 views/h a partir das 02h de sexta.
export function picoComprado(): number[] {
  const { f, rates } = base(7);
  return sum(noisy(f, rates, 0.1), bots(f, { from: 98, hours: 6, level: 2600, jitter: 0.02 }));
}

export function organicoEstavel(): number[] {
  const { f, rates } = base(11, 800);
  return noisy(f, rates, 0.12);
}

// 60 h seguidas de bots a 1.500 views/h, sem dia e noite.
export function platoDeBots(): number[] {
  const { f, rates } = base(13, 400);
  return sum(noisy(f, rates, 0.12), bots(f, { from: 40, hours: 60, level: 1500, jitter: 0.02 }));
}

// Bots a 1.200 views/h desde o início, desligados de uma vez na hora 70.
export function quedaAbrupta(): number[] {
  const { f, rates } = base(17, 300);
  return sum(noisy(f, rates, 0.12), bots(f, { from: 0, hours: 70, level: 1200, jitter: 0.04 }));
}

export function valorConstante(): number[] {
  return Array.from({ length: HOURS }, () => 500);
}

// O mesmo dia de 24 valores, repetido sete vezes: segue o ritmo, mas é cópia exata.
export function cicloCopiado(): number[] {
  const day = Array.from({ length: 24 }, (_, h) => 200 + ((h * 37) % 300));
  return Array.from({ length: HOURS }, (_, t) => day[t % 24]);
}

// Criador pequeno: uns 10 views/h no horário nobre.
export function baixoVolume(): number[] {
  const { f, rates } = base(19, 10);
  return noisy(f, rates, 0.15);
}

// Público espalhado por vários fusos: o dia e a noite de São Paulo quase não aparecem.
export function audienciaGlobal(): number[] {
  const { f, rates } = base(23, 900, 0.3);
  return noisy(f, rates, 0.12);
}

// Vídeo viral removido 20 h depois do início do pico: as views vão a quase zero e não voltam.
export function videoRemovido(): number[] {
  const series = viralOrganico();
  return series.map((v, t) => (t >= 110 ? (t % 7 === 0 ? 1 : 0) : v));
}

// O mesmo viral da quinta às 18h, mas o algoritmo para de recomendar 4 h depois do topo:
// sobe em 1 h, decai por 4 h e volta de uma vez ao público de antes.
export function viralCortado(): number[] {
  const { f, rates } = base(7);
  const viral = addViral(f, rates, { at: 90, amplitude: 3000, riseHours: 1, halfLife: 10 });
  return noisy(f, viral.map((r, t) => (t >= 94 ? rates[t] : r)), 0.1);
}

// Live ou estreia às 20h de quarta, com ~3.000 pessoas a mais por hora enquanto dura.
export function live(hours: number): number[] {
  const { f, rates } = base(7);
  return noisy(f, rates.map((r, t) => (t >= 68 && t < 68 + hours ? r + 3000 : r)), 0.1);
}
