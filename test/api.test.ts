import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { picoComprado, START, viralOrganico } from "./fixtures.ts";

const app = createApp();

async function post(body: unknown) {
  return app.request("/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /classify", () => {
  it("devolve classificação, motivo e sinais", async () => {
    const res = await post({ series: picoComprado(), start_at: START.toISOString() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { label: string; reason: string; signals: Array<Record<string, unknown>> };
    expect(body.label).toBe("suspeito");
    expect(body.reason).toMatch(/^Suspeito: /);
    expect(body.signals[0]).toEqual({
      name: "views_zeradas",
      value: 0,
      threshold: 6,
      triggered: false,
      explanation: expect.any(String),
    });
  });

  it("start_at é opcional", async () => {
    const res = await post({ series: viralOrganico() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { label: string }).label).toBe("legitimo");
  });

  it("série curta responde 200 com inconclusivo, não erro", async () => {
    const res = await post({ series: [10, 20, 30] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { label: string }).label).toBe("inconclusivo");
  });

  it.each([
    ["corpo que não é JSON", "{series:"],
    ["sem series", { start_at: START.toISOString() }],
    ["series vazia", { series: [] }],
    ["views negativas", { series: [10, -1, 5] }],
    ["views que não são número", { series: [10, "20", 5] }],
    ["série longa demais", { series: new Array(24 * 90 + 1).fill(1) }],
    ["start_at inválido", { series: [1, 2, 3], start_at: "ontem" }],
  ])("400 para %s", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
  });
});

describe("GET /health", () => {
  it("responde ok", async () => {
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ ok: true });
  });
});
