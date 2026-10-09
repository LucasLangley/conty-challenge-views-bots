import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { generateDataset, SEED, toJsonl } from "../src/dataset/build.ts";
import { GENERATORS } from "../src/dataset/generators.ts";

describe("dataset sintético", () => {
  const dataset = generateDataset();

  it("tem centenas de séries, de todos os geradores, legítimas e suspeitas", () => {
    expect(dataset.length).toBeGreaterThanOrEqual(500);
    expect(new Set(dataset.map((s) => s.generator))).toEqual(new Set(GENERATORS.map((g) => g.name)));
    expect(new Set(dataset.map((s) => s.truth))).toEqual(new Set(["legitimo", "suspeito"]));
    expect(new Set(dataset.map((s) => s.id)).size).toBe(dataset.length);
  });

  it("a mesma seed gera exatamente o mesmo dataset; outra seed gera outro", () => {
    expect(generateDataset(SEED)).toEqual(dataset);
    expect(generateDataset(SEED + 1)).not.toEqual(dataset);
  });

  it("não usa Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    generateDataset(SEED, 2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("o arquivo dataset/series.jsonl é o que npm run eval gera hoje", () => {
    const file = readFileSync(new URL("../dataset/series.jsonl", import.meta.url), "utf8");
    expect(file === toJsonl(dataset)).toBe(true);
  });
});
