import { Hono } from "hono";
import { classify } from "./domain/classifier.ts";
import { LIMIARES } from "./domain/thresholds.ts";

type Parsed = { ok: true; series: number[]; startAt?: Date } | { ok: false; error: string };

function parseBody(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "corpo inválido: envie JSON com series" };
  const record = body as Record<string, unknown>;
  const series = record.series;
  if (!Array.isArray(series) || series.length === 0) {
    return { ok: false, error: "series deve ser uma lista não vazia de views por hora" };
  }
  if (series.length > LIMIARES.maxHoras) {
    return { ok: false, error: `series aceita no máximo ${LIMIARES.maxHoras} horas` };
  }
  if (!series.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
    return { ok: false, error: "cada hora de series deve ser um número maior ou igual a zero" };
  }
  if (record.start_at === undefined || record.start_at === null) return { ok: true, series };
  if (typeof record.start_at !== "string" || Number.isNaN(Date.parse(record.start_at))) {
    return { ok: false, error: "start_at deve ser uma data ISO 8601, por exemplo 2026-09-07T03:00:00Z" };
  }
  return { ok: true, series, startAt: new Date(record.start_at) };
}

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/classify", async (c) => {
    const parsed = parseBody(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return c.json(classify(parsed.series, parsed.startAt));
  });

  return app;
}
