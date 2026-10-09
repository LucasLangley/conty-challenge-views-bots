import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDataset } from "../src/dataset/build.ts";
import { evaluate, percent } from "../src/evaluation.ts";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const report = evaluate(generateDataset());

// O README declara os números entre marcadores fixos: <!-- eval:nome -->valor<!-- /eval -->.
function marker(name: string): number {
  const match = readme.match(new RegExp(`<!-- eval:${name} -->([^<]+)<!-- /eval -->`));
  if (!match) throw new Error(`marcador eval:${name} não encontrado no README`);
  return Number(match[1].replace("%", "").replace(",", ".").trim());
}

describe("números do README batem com npm run eval", () => {
  it("taxa de falso positivo", () => {
    expect(marker("taxa_falso_positivo")).toBe(percent(report.taxaFalsoPositivo));
  });

  it("recall dos suspeitos", () => {
    expect(marker("recall")).toBe(percent(report.recall));
  });

  it("quantidade de inconclusivos", () => {
    expect(marker("inconclusivos")).toBe(report.inconclusivos);
  });
});
