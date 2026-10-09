import { horas, pct, vezes, views } from "./format.ts";
import {
  buildContext,
  coeficienteVariacao,
  detectZeragem,
  HIPOTESE,
  periodicidadeExata,
  picoNaMadrugada,
  picoSobreMediana,
  PESO,
  plato,
  quedaAbrupta,
  ritmoCircadiano,
  simetriaSubidaQueda,
  valoresRepetidos,
  viewsZeradas,
  type Evaluated,
  type Signal,
  type SignalName,
} from "./signals.ts";
import { LIMIARES } from "./thresholds.ts";

export type Label = "legitimo" | "suspeito" | "inconclusivo";

export type Classification = {
  label: Label;
  reason: string;
  signals: Signal[];
};

// Dica para quem lê um inconclusivo: o que mais explicaria o único sinal que disparou.
const OUTRA_EXPLICACAO: Record<SignalName, string> = {
  views_zeradas: "",
  pico_sobre_mediana: "",
  simetria_subida_queda: "Pode ser uma live ou estreia, que começa e termina em hora marcada.",
  plato: "Pode ser público grande e muito estável; vale olhar a série inteira.",
  queda_abrupta: "Pode ser o vídeo removido, arquivado ou fora da recomendação.",
  ritmo_circadiano: "Pode ser público de outro fuso horário.",
  pico_na_madrugada: "Pode ser um vídeo que estourou em outro fuso horário.",
  coeficiente_variacao: "Pode ser público grande e espalhado por vários fusos.",
  valores_repetidos: "",
  periodicidade_exata: "",
};

export function classify(series: number[], startAt?: Date): Classification {
  if (series.length < LIMIARES.minHoras) {
    return {
      label: "inconclusivo",
      reason:
        `Inconclusivo: a série tem ${horas(series.length)}. Com menos de ${horas(LIMIARES.minHoras)} não há dois ciclos ` +
        `de dia e noite para comparar, então não classifico.`,
      signals: [],
    };
  }
  if (series.every((v) => v === 0)) {
    return { label: "inconclusivo", reason: "Inconclusivo: a série não tem nenhuma view.", signals: [] };
  }

  const zeragem = detectZeragem(series);
  const zerou = viewsZeradas(series, zeragem, startAt);
  const analyzed = zeragem ? series.slice(0, zeragem.from) : series;
  if (analyzed.length < LIMIARES.minHoras) {
    return {
      label: "inconclusivo",
      reason:
        `Inconclusivo: ${zerou.resumo}. Antes disso há só ${horas(analyzed.length)}, menos que ` +
        `${horas(LIMIARES.minHoras)}, então não há série suficiente para julgar.`,
      signals: [zerou.signal],
    };
  }

  const ctx = buildContext(analyzed, startAt);
  const evaluated: Evaluated[] = [
    zerou,
    picoSobreMediana(ctx),
    simetriaSubidaQueda(ctx),
    plato(ctx),
    quedaAbrupta(ctx),
    ritmoCircadiano(ctx),
    picoNaMadrugada(ctx),
    coeficienteVariacao(ctx),
    valoresRepetidos(ctx),
    periodicidadeExata(ctx),
  ];
  const signals = evaluated.map((e) => e.signal);
  const nota = zeragem ? ` Obs.: ${zerou.resumo}; analisei só as ${horas(analyzed.length)} anteriores.` : "";
  const { label, reason } = decide(evaluated, ctx.median);
  return { label, reason: reason + nota, signals };
}

function decide(evaluated: Evaluated[], median: number): { label: Label; reason: string } {
  const hits = evaluated.filter((e) => e.signal.triggered && PESO[e.signal.name] !== "contexto");
  const fortes = hits.filter((e) => PESO[e.signal.name] === "forte");
  const resumo = hits.map((e) => e.resumo).join("; ");
  const independentes = new Set(hits.map((e) => HIPOTESE[e.signal.name])).size;

  if (fortes.length > 0) {
    return {
      label: "suspeito",
      reason:
        `Suspeito: o número exato de views se repete de um jeito que público humano não produz com mediana de ` +
        `${views(median)} views/h. Sinais: ${resumo}.`,
    };
  }
  if (independentes >= 2) {
    return { label: "suspeito", reason: `Suspeito: ${independentes} sinais independentes de tráfego não humano: ${resumo}.` };
  }
  if (independentes === 1) {
    const [hit] = hits;
    const quais = hits.length === 1 ? `só um sinal disparou (${resumo})` : `só uma hipótese disparou (${resumo})`;
    return {
      label: "inconclusivo",
      reason:
        `Inconclusivo: ${quais}, e um sinal sozinho não basta para acusar. ` +
        `${OUTRA_EXPLICACAO[hit.signal.name]} Os demais sinais avaliados estão dentro do esperado.`,
    };
  }
  if (median < LIMIARES.volumeMinimo) {
    return {
      label: "inconclusivo",
      reason:
        `Inconclusivo: nenhum sinal disparou, mas a mediana é de ${views(median)} views/h, abaixo de ` +
        `${LIMIARES.volumeMinimo}. Com tão pouco volume não dá para separar repetição mecânica de acaso, ` +
        `então prefiro não chamar de legítimo nem de suspeito.`,
    };
  }
  return { label: "legitimo", reason: legitReason(evaluated) };
}

function legitReason(evaluated: Evaluated[]): string {
  const byName = new Map(evaluated.map((e) => [e.signal.name, e.signal]));
  const avaliados = evaluated.filter((e) => e.signal.value !== null && PESO[e.signal.name] !== "contexto").length;
  let reason = `Legítimo: nenhum dos ${avaliados} sinais de tráfego não humano avaliados disparou.`;
  const pico = byName.get("pico_sobre_mediana");
  if (pico?.triggered && pico.value !== null) {
    reason += ` Há um pico de ${vezes(pico.value)} a mediana, mas com formato de vídeo que estourou: sobe rápido e desce aos poucos.`;
  }
  const ritmo = byName.get("ritmo_circadiano");
  if (ritmo?.value !== null && ritmo?.value !== undefined) {
    reason += ` A madrugada teve ${pct(ritmo.value)} do movimento da tarde e noite, como público humano no Brasil.`;
  } else {
    reason += " Sem start_at, o ritmo de dia e noite não foi avaliado.";
  }
  return reason;
}
