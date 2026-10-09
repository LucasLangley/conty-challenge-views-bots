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
  type Hipotese,
  type Signal,
} from "./signals.ts";
import { LIMIARES } from "./thresholds.ts";

export type Label = "legitimo" | "suspeito" | "inconclusivo";

export type Classification = {
  label: Label;
  reason: string;
  signals: Signal[];
};

// Como cada hipótese aparece no motivo, e o que mais a explicaria num inconclusivo.
// Só as hipóteses dos sinais fracos chegam aqui: forte decide sozinho e contexto não conta.
const LEITURA: Record<Hipotese, { descricao: string; outraExplicacao: string }> = {
  views_zeradas: { descricao: "", outraExplicacao: "" },
  pico_sobre_mediana: { descricao: "", outraExplicacao: "" },
  fim_do_pico: {
    descricao: "as views pararam de uma vez",
    outraExplicacao:
      "Pode ser uma live ou estreia, que começa e termina em hora marcada, ou o algoritmo parando de recomendar o vídeo.",
  },
  serie_plana: {
    descricao: "a série é plana demais",
    outraExplicacao: "Pode ser público grande, estável e espalhado por vários fusos; vale olhar a série inteira.",
  },
  fuso_sao_paulo: {
    descricao: "o horário não bate com público em São Paulo",
    outraExplicacao: "Pode ser público de outro fuso horário, ou um vídeo que estourou fora do Brasil.",
  },
  valores_repetidos: { descricao: "", outraExplicacao: "" },
  periodicidade_exata: { descricao: "", outraExplicacao: "" },
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
  const { label, reason } = decide(evaluated, ctx.median, startAt !== undefined);
  return { label, reason: reason + nota, signals };
}

function decide(evaluated: Evaluated[], median: number, temHorario: boolean): { label: Label; reason: string } {
  const hits = evaluated.filter((e) => e.signal.triggered && PESO[e.signal.name] !== "contexto");
  const fortes = hits.filter((e) => PESO[e.signal.name] === "forte");
  const resumo = hits.map((e) => e.resumo).join("; ");

  if (fortes.length > 0) {
    return {
      label: "suspeito",
      reason:
        `Suspeito: o número exato de views se repete de um jeito que público humano não produz com mediana de ` +
        `${views(median)} views/h. Sinais: ${resumo}.`,
    };
  }

  // Sinais da mesma hipótese viram um grupo só: é o grupo que conta, não o sinal.
  const grupos = new Map<Hipotese, string[]>();
  for (const e of hits) {
    const hipotese = HIPOTESE[e.signal.name];
    grupos.set(hipotese, [...(grupos.get(hipotese) ?? []), e.resumo]);
  }

  if (grupos.size >= 2) {
    const frases = [...grupos].map(([h, resumos]) => `${capitalizar(LEITURA[h].descricao)}: ${resumos.join("; ")}.`);
    return {
      label: "suspeito",
      reason: `Suspeito: ${grupos.size} hipóteses independentes de tráfego não humano. ${frases.join(" ")}`,
    };
  }
  if (grupos.size === 1) {
    const [[hipotese, resumos]] = [...grupos];
    const { descricao, outraExplicacao } = LEITURA[hipotese];
    // Sem o horário, compra em bloco e live têm o mesmo formato; o que as separaria é o pico cair de madrugada.
    const semHorario =
      hipotese === "fim_do_pico" && !temHorario
        ? " Sem start_at não dá para saber se o pico caiu de madrugada, que é o que separaria uma compra de uma live; envie start_at para essa checagem."
        : "";
    return {
      label: "inconclusivo",
      reason:
        `Inconclusivo: só uma hipótese de tráfego não humano apareceu, ${descricao} (${resumos.join("; ")}), ` +
        `e uma hipótese sozinha não basta para acusar. ${outraExplicacao} Os demais sinais avaliados estão dentro do esperado.` +
        semHorario,
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

function capitalizar(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
