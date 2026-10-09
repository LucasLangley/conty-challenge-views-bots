import { frame, GENERATORS, type Truth } from "./generators.ts";
import { hashSeed, mulberry32 } from "./prng.ts";

export const SEED = 20261009;
export const SERIES_POR_GERADOR = 40;

export type Sample = {
  id: string;
  generator: string;
  truth: Truth;
  limitrofe: boolean;
  start_at: string;
  series: number[];
};

export function generateDataset(seed = SEED, perGenerator = SERIES_POR_GERADOR): Sample[] {
  const samples: Sample[] = [];
  for (const generator of GENERATORS) {
    for (let i = 0; i < perGenerator; i++) {
      const f = frame(mulberry32(hashSeed(seed, generator.name, i)));
      samples.push({
        id: `${generator.name}-${String(i).padStart(3, "0")}`,
        generator: generator.name,
        truth: generator.truth,
        limitrofe: generator.limitrofe,
        start_at: f.startAt.toISOString(),
        series: generator.build(f),
      });
    }
  }
  return samples;
}

export function toJsonl(samples: Sample[]): string {
  return samples.map((s) => JSON.stringify(s)).join("\n") + "\n";
}
