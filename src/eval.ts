import { mkdirSync, writeFileSync } from "node:fs";
import { generateDataset, SEED, SERIES_POR_GERADOR, toJsonl } from "./dataset/build.ts";
import { evaluate, formatPercent } from "./evaluation.ts";

const samples = generateDataset();
const report = evaluate(samples);

mkdirSync("dataset", { recursive: true });
writeFileSync("dataset/series.jsonl", toJsonl(samples));
writeFileSync("dataset/eval.json", JSON.stringify({ seed: SEED, series_por_gerador: SERIES_POR_GERADOR, ...report }, null, 2) + "\n");

const pad = (v: string | number, n: number) => String(v).padEnd(n);
console.log(`seed ${SEED}, ${report.series} séries (${SERIES_POR_GERADOR} por gerador)\n`);
console.log(`${pad("gerador", 24)}${pad("verdade", 11)}${pad("legitimo", 10)}${pad("inconcl.", 10)}suspeito`);
for (const row of report.porGerador) {
  const name = row.limitrofe ? `${row.generator}*` : row.generator;
  console.log(`${pad(name, 24)}${pad(row.truth, 11)}${pad(row.legitimo, 10)}${pad(row.inconclusivo, 10)}${row.suspeito}`);
}
console.log("* limítrofe\n");
console.log(
  `taxa de falso positivo: ${formatPercent(report.taxaFalsoPositivo)} (${report.legitimos.suspeito} de ${report.legitimos.total} legítimos)`,
);
console.log(`recall dos suspeitos:   ${formatPercent(report.recall)} (${report.suspeitos.suspeito} de ${report.suspeitos.total})`);
console.log(
  `inconclusivos:          ${report.inconclusivos} (${report.legitimos.inconclusivo} legítimos, ${report.suspeitos.inconclusivo} suspeitos)`,
);
console.log(
  `só geradores centrais:  falso positivo ${formatPercent(report.centrais.taxaFalsoPositivo)}, recall ${formatPercent(report.centrais.recall)}`,
);
if (report.falsosPositivos.length > 0) console.log(`falsos positivos: ${report.falsosPositivos.join(", ")}`);
console.log("\ndataset/series.jsonl e dataset/eval.json gravados");
