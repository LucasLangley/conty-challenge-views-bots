import type { Sample } from "./dataset/build.ts";
import { classify, type Label } from "./domain/classifier.ts";

type Counts = Record<Label, number> & { total: number };

export type Report = {
  series: number;
  legitimos: Counts;
  suspeitos: Counts;
  // legítimos classificados como suspeito / legítimos
  taxaFalsoPositivo: number;
  // suspeitos classificados como suspeito / suspeitos
  recall: number;
  inconclusivos: number;
  // as mesmas duas taxas só nos geradores centrais, sem os limítrofes
  centrais: { taxaFalsoPositivo: number; recall: number };
  porGerador: Array<{ generator: string; truth: string; limitrofe: boolean } & Counts>;
  falsosPositivos: string[];
};

function empty(): Counts {
  return { total: 0, legitimo: 0, suspeito: 0, inconclusivo: 0 };
}

export function evaluate(samples: Sample[]): Report {
  const legitimos = empty();
  const suspeitos = empty();
  const porGerador = new Map<string, Report["porGerador"][number]>();
  const falsosPositivos: string[] = [];

  for (const sample of samples) {
    const { label } = classify(sample.series, new Date(sample.start_at));
    const bucket = sample.truth === "legitimo" ? legitimos : suspeitos;
    bucket.total++;
    bucket[label]++;
    const row = porGerador.get(sample.generator) ?? {
      generator: sample.generator,
      truth: sample.truth,
      limitrofe: sample.limitrofe,
      ...empty(),
    };
    row.total++;
    row[label]++;
    porGerador.set(sample.generator, row);
    if (sample.truth === "legitimo" && label === "suspeito") falsosPositivos.push(sample.id);
  }

  const rows = [...porGerador.values()].filter((r) => !r.limitrofe);
  const legit = rows.filter((r) => r.truth === "legitimo");
  const susp = rows.filter((r) => r.truth === "suspeito");
  const total = (list: typeof rows, key: keyof Counts) => list.reduce((acc, r) => acc + r[key], 0);

  return {
    series: samples.length,
    legitimos,
    suspeitos,
    taxaFalsoPositivo: legitimos.suspeito / legitimos.total,
    recall: suspeitos.suspeito / suspeitos.total,
    inconclusivos: legitimos.inconclusivo + suspeitos.inconclusivo,
    centrais: {
      taxaFalsoPositivo: total(legit, "suspeito") / total(legit, "total"),
      recall: total(susp, "suspeito") / total(susp, "total"),
    },
    porGerador: [...porGerador.values()],
    falsosPositivos,
  };
}

// Mesmo arredondamento usado no README: porcentagem com uma casa decimal.
export function percent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

export function formatPercent(fraction: number): string {
  return `${percent(fraction).toFixed(1).replace(".", ",")}%`;
}
