import { describe, expect, it } from "vitest";
import { classify, type Classification } from "../src/domain/classifier.ts";
import type { SignalName } from "../src/domain/signals.ts";
import { LIMIARES } from "../src/domain/thresholds.ts";
import {
  audienciaGlobal,
  baixoVolume,
  cicloCopiado,
  live,
  organicoEstavel,
  picoComprado,
  platoDeBots,
  quedaAbrupta,
  START,
  valorConstante,
  videoRemovido,
  viralCortado,
  viralOrganico,
} from "./fixtures.ts";

function signal(result: Classification, name: SignalName) {
  const found = result.signals.find((s) => s.name === name);
  if (!found) throw new Error(`sinal ${name} ausente`);
  return found;
}

function triggered(result: Classification): SignalName[] {
  return result.signals.filter((s) => s.triggered).map((s) => s.name);
}

describe("pico orgânico e pico comprado, lado a lado", () => {
  const organico = classify(viralOrganico(), START);
  const comprado = classify(picoComprado(), START);

  it("os dois têm pico de mais de 10× a mediana: a altura sozinha não separa", () => {
    expect(signal(organico, "pico_sobre_mediana").value).toBeGreaterThan(10);
    expect(signal(comprado, "pico_sobre_mediana").value).toBeGreaterThan(10);
    expect(signal(organico, "pico_sobre_mediana").triggered).toBe(true);
    expect(signal(comprado, "pico_sobre_mediana").triggered).toBe(true);
  });

  it("o formato separa: o viral é legítimo e o comprado é suspeito", () => {
    expect(organico.label).toBe("legitimo");
    expect(comprado.label).toBe("suspeito");
  });

  it("sinal a sinal: [orgânico, comprado]", () => {
    const lado = Object.fromEntries(
      organico.signals.map((s) => [s.name, [s.triggered, signal(comprado, s.name).triggered]]),
    );
    expect(lado).toEqual({
      views_zeradas: [false, false],
      pico_sobre_mediana: [true, true],
      simetria_subida_queda: [false, true],
      plato: [false, false],
      queda_abrupta: [false, true],
      ritmo_circadiano: [false, false],
      pico_na_madrugada: [false, true],
      coeficiente_variacao: [false, false],
      valores_repetidos: [false, false],
      periodicidade_exata: [false, false],
    });
  });

  it("o viral desce aos poucos; o comprado volta à mediana em 1 h", () => {
    expect(signal(organico, "simetria_subida_queda").value).toBeLessThan(0.5);
    expect(signal(comprado, "simetria_subida_queda").value).toBe(1);
    expect(signal(organico, "queda_abrupta").value).toBeLessThan(LIMIARES.quedaAbrupta);
    expect(signal(comprado, "queda_abrupta").value).toBeGreaterThan(0.9);
  });

  it("o viral acontece com o público acordado; o comprado, de madrugada", () => {
    expect(signal(organico, "pico_na_madrugada").value).toBe(0);
    expect(signal(comprado, "pico_na_madrugada").value).toBeGreaterThan(LIMIARES.picoNaMadrugada);
    expect(organico.reason).toContain("formato de vídeo que estourou");
    expect(comprado.reason).toContain("ligado e desligado");
  });
});

describe("casos óbvios", () => {
  it("público estável com dia e noite é legítimo", () => {
    const result = classify(organicoEstavel(), START);
    expect(result.label).toBe("legitimo");
    expect(triggered(result)).toEqual([]);
  });

  it("o mesmo número toda hora é suspeito por repetição exata", () => {
    const result = classify(valorConstante(), START);
    expect(result.label).toBe("suspeito");
    expect(triggered(result)).toEqual(
      expect.arrayContaining(["valores_repetidos", "periodicidade_exata", "coeficiente_variacao", "plato"]),
    );
    expect(result.reason).toContain("o mesmo valor (500) em 100% das horas");
  });

  it("um dia copiado sete vezes é suspeito mesmo seguindo o dia e a noite", () => {
    const result = classify(cicloCopiado(), START);
    expect(result.label).toBe("suspeito");
    expect(signal(result, "periodicidade_exata").triggered).toBe(true);
    expect(signal(result, "periodicidade_exata").explanation).toContain("às de 24 h antes");
    expect(signal(result, "coeficiente_variacao").triggered).toBe(false);
  });

  it("platô de bots é suspeito pelo platô e pela queda no fim", () => {
    const result = classify(platoDeBots(), START);
    expect(result.label).toBe("suspeito");
    expect(triggered(result)).toEqual(expect.arrayContaining(["plato", "queda_abrupta"]));
  });

  it("bots desligados de uma vez deixam queda abrupta e platô", () => {
    const result = classify(quedaAbrupta(), START);
    expect(result.label).toBe("suspeito");
    expect(signal(result, "queda_abrupta").value).toBeGreaterThan(0.8);
    expect(signal(result, "queda_abrupta").explanation).toMatch(/antes das 22h de 09\/09/);
  });
});

describe("quando o classificador prefere não acusar", () => {
  it("volume baixo: mediana abaixo de 20 views/h vira inconclusivo", () => {
    const result = classify(baixoVolume(), START);
    expect(result.label).toBe("inconclusivo");
    expect(result.reason).toMatch(/mediana é de \d+ views\/h, abaixo de 20/);
    expect(signal(result, "valores_repetidos").value).toBeNull();
  });

  it("público de outro fuso: só o ritmo dispara, e um sinal sozinho não acusa", () => {
    const result = classify(audienciaGlobal(), START);
    expect(result.label).toBe("inconclusivo");
    expect(triggered(result)).toEqual(["ritmo_circadiano"]);
    expect(result.reason).toContain("outro fuso horário");
  });

  it("ritmo e pico na madrugada contam como uma hipótese só (público em São Paulo)", () => {
    // Vídeo que estourou às 02h de sexta para um público de outro fuso: sobe de uma vez e desce aos poucos.
    const night = audienciaGlobal().map((v, t) => (t >= 98 ? Math.round(v * (1 + 5 * 0.7 ** (t - 98))) : v));
    const result = classify(night, START);
    expect(signal(result, "ritmo_circadiano").triggered).toBe(true);
    expect(signal(result, "pico_na_madrugada").triggered).toBe(true);
    expect(result.label).toBe("inconclusivo");
  });

  it("viral que o algoritmo para de recomendar 4 h depois do topo não é suspeito", () => {
    const result = classify(viralCortado(), START);
    // Sobe em 1 h e cai de uma vez: as duas medidas do fim do pico disparam, mas contam como uma.
    expect(signal(result, "simetria_subida_queda").triggered).toBe(true);
    expect(signal(result, "queda_abrupta").triggered).toBe(true);
    expect(result.label).toBe("inconclusivo");
    expect(result.reason).toContain("o algoritmo parando de recomendar o vídeo");
  });

  it.each([1, 2, 3])("live de %i h às 20h não é suspeita", (hours) => {
    const result = classify(live(hours), START);
    expect(signal(result, "simetria_subida_queda").triggered).toBe(true);
    expect(signal(result, "pico_na_madrugada").triggered).toBe(false);
    expect(result.label).toBe("inconclusivo");
    expect(result.reason).toContain("Pode ser uma live ou estreia");
  });

  it("live de 1 h e de 2 h recebem o mesmo raciocínio, mesmo com a de 2 h disparando um sinal a mais", () => {
    const uma = classify(live(1), START);
    const duas = classify(live(2), START);
    expect(signal(uma, "queda_abrupta").triggered).toBe(false);
    expect(signal(duas, "queda_abrupta").triggered).toBe(true);
    // Fora os números entre parênteses, o motivo é o mesmo texto.
    const semNumeros = (reason: string) => reason.replace(/\(.*\)/, "(...)");
    expect(semNumeros(duas.reason)).toBe(semNumeros(uma.reason));
    expect(uma.reason).toMatch(/^Inconclusivo: só uma hipótese de tráfego não humano apareceu, as views pararam de uma vez \(/);
  });

  it("série com menos de 48 h é inconclusiva e não usa sinal nenhum", () => {
    const result = classify(organicoEstavel().slice(0, 30), START);
    expect(result).toEqual({
      label: "inconclusivo",
      reason: expect.stringContaining("a série tem 30 h"),
      signals: [],
    });
  });

  it("série toda zerada é inconclusiva", () => {
    expect(classify(new Array(72).fill(0), START).label).toBe("inconclusivo");
  });

  it("vídeo removido não é acusado: a zeragem corta a análise e é explicada", () => {
    const result = classify(videoRemovido(), START);
    expect(result.label).not.toBe("suspeito");
    expect(signal(result, "views_zeradas").triggered).toBe(true);
    expect(signal(result, "views_zeradas").value).toBe(58);
    expect(result.reason).toContain("parece vídeo removido; analisei só as 110 h anteriores");
  });
});

describe("explicação legível", () => {
  const cases = [
    viralOrganico,
    picoComprado,
    organicoEstavel,
    platoDeBots,
    quedaAbrupta,
    valorConstante,
    cicloCopiado,
    baixoVolume,
    audienciaGlobal,
    videoRemovido,
  ];

  it.each(cases.map((build) => [build.name, build] as const))("%s: motivo em português, com números e sem nome de variável", (_, build) => {
    const result = classify(build(), START);
    expect(result.reason).toMatch(/^(Legítimo|Suspeito|Inconclusivo): /);
    expect(result.reason).toMatch(/\d/);
    expect(result.reason).not.toMatch(/[a-z]+_[a-z]+/);
    for (const s of result.signals.filter((x) => x.triggered)) expect(s.explanation).toMatch(/\d/);
  });

  it("cada sinal traz valor, limiar nomeado, se disparou e a explicação", () => {
    const result = classify(picoComprado(), START);
    expect(result.signals).toHaveLength(10);
    expect(signal(result, "plato").threshold).toBe(LIMIARES.platoHoras);
    expect(signal(result, "queda_abrupta").threshold).toBe(LIMIARES.quedaAbrupta);
    for (const s of result.signals) {
      expect(Object.keys(s)).toEqual(["name", "value", "threshold", "triggered", "explanation"]);
      expect(s.explanation.length).toBeGreaterThan(20);
    }
  });

  it("sem start_at, os sinais de fuso não são avaliados e o resto continua valendo", () => {
    const organico = classify(viralOrganico());
    const comprado = classify(picoComprado());
    expect(signal(organico, "ritmo_circadiano")).toMatchObject({ value: null, triggered: false });
    expect(signal(organico, "ritmo_circadiano").explanation).toContain("Sem start_at");
    expect(organico.label).toBe("legitimo");
    // Sem a hora, sobra só o formato: ligado e desligado é uma hipótese só, a mesma de uma live.
    expect(signal(comprado, "simetria_subida_queda").triggered).toBe(true);
    expect(signal(comprado, "queda_abrupta").triggered).toBe(true);
    expect(comprado.label).toBe("inconclusivo");
    expect(signal(comprado, "queda_abrupta").explanation).toContain("da hora 104 da série");
  });
});
