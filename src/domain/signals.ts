import { horas, pct, round3, vezes, views } from "./format.ts";
import { LIMIARES, MADRUGADA, TARDE_E_NOITE } from "./thresholds.ts";
import { describeHour, describeHourFrom, saoPauloHours } from "./time.ts";

export type SignalName =
  | "views_zeradas"
  | "pico_sobre_mediana"
  | "simetria_subida_queda"
  | "plato"
  | "queda_abrupta"
  | "ritmo_circadiano"
  | "pico_na_madrugada"
  | "coeficiente_variacao"
  | "valores_repetidos"
  | "periodicidade_exata";

export type Signal = {
  name: SignalName;
  value: number | null;
  threshold: number;
  triggered: boolean;
  explanation: string;
};

// contexto: mostra que há algo para examinar, nunca acusa.
// fraco: um sozinho deixa inconclusivo; dois ou mais tornam suspeito.
// forte: repetição exata, que público humano não produz nesse volume; sozinho já torna suspeito.
export type Peso = "contexto" | "fraco" | "forte";

export const PESO: Record<SignalName, Peso> = {
  views_zeradas: "contexto",
  pico_sobre_mediana: "contexto",
  simetria_subida_queda: "fraco",
  plato: "fraco",
  queda_abrupta: "fraco",
  ritmo_circadiano: "fraco",
  pico_na_madrugada: "fraco",
  coeficiente_variacao: "fraco",
  valores_repetidos: "forte",
  periodicidade_exata: "forte",
};

// Sinais que dependem da mesma hipótese contam como um só.
// fim_do_pico: simetria e queda abrupta medem as duas o pico terminar de uma vez; live, estreia
// e vídeo que sai da recomendação disparam as duas juntas.
// serie_plana: platô e coeficiente de variação medem os dois a falta de variação, em trecho e na série inteira.
// fuso_sao_paulo: ritmo e pico na madrugada supõem público em São Paulo; com público em outro fuso,
// os dois disparam juntos.
export const HIPOTESE = {
  views_zeradas: "views_zeradas",
  pico_sobre_mediana: "pico_sobre_mediana",
  simetria_subida_queda: "fim_do_pico",
  plato: "serie_plana",
  queda_abrupta: "fim_do_pico",
  ritmo_circadiano: "fuso_sao_paulo",
  pico_na_madrugada: "fuso_sao_paulo",
  coeficiente_variacao: "serie_plana",
  valores_repetidos: "valores_repetidos",
  periodicidade_exata: "periodicidade_exata",
} as const satisfies Record<SignalName, string>;

export type Hipotese = (typeof HIPOTESE)[SignalName];

export type Evaluated = { signal: Signal; resumo: string };

type Event = { peakIndex: number; peak: number; amplitude: number; start: number; end: number };

export type Context = {
  series: number[];
  median: number;
  startAt?: Date;
  hours?: number[];
  event?: Event;
};

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function buildContext(series: number[], startAt?: Date): Context {
  const med = median(series);
  const ctx: Context = { series, median: med, startAt };
  if (startAt) ctx.hours = saoPauloHours(startAt, series.length);

  const peak = Math.max(...series);
  if (peak / Math.max(med, 1) >= LIMIARES.picoSobreMediana) {
    const peakIndex = series.indexOf(peak);
    const half = med + (peak - med) / 2;
    let start = peakIndex;
    while (start > 0 && series[start - 1] >= half) start--;
    let end = peakIndex;
    while (end < series.length - 1 && series[end + 1] >= half) end++;
    ctx.event = { peakIndex, peak, amplitude: peak - med, start, end };
  }
  return ctx;
}

function make(name: SignalName, value: number | null, triggered: boolean, explanation: string, resumo = ""): Evaluated {
  return {
    signal: {
      name,
      value: value === null ? null : round3(value),
      threshold: LIMIARES[thresholdKey[name]],
      triggered,
      explanation,
    },
    resumo,
  };
}

const thresholdKey = {
  views_zeradas: "zeragemHoras",
  pico_sobre_mediana: "picoSobreMediana",
  simetria_subida_queda: "simetriaBordas",
  plato: "platoHoras",
  queda_abrupta: "quedaAbrupta",
  ritmo_circadiano: "ritmoMadrugada",
  pico_na_madrugada: "picoNaMadrugada",
  coeficiente_variacao: "coeficienteVariacao",
  valores_repetidos: "valoresRepetidos",
  periodicidade_exata: "periodicidadeExata",
} as const satisfies Record<SignalName, keyof typeof LIMIARES>;

export type Zeragem = { from: number; medianBefore: number; limit: number };

// Primeira hora a partir da qual a série fica perto de zero até o fim. Vídeo removido ou
// arquivado faz isso; bot desligado não, porque o público de antes continua lá.
export function detectZeragem(series: number[]): Zeragem | null {
  const { zeragemFracao, zeragemPiso, zeragemHoras, volumeMinimo } = LIMIARES;
  const n = series.length;
  const suffixMax = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixMax[i] = Math.max(series[i], suffixMax[i + 1]);
  let prefixMax = 0;
  for (let t = 1; t <= n - zeragemHoras; t++) {
    prefixMax = Math.max(prefixMax, series[t - 1]);
    if (suffixMax[t] > Math.max(zeragemFracao * prefixMax, zeragemPiso)) continue;
    const medianBefore = median(series.slice(0, t));
    if (medianBefore < volumeMinimo) continue;
    const limit = Math.max(zeragemFracao * medianBefore, zeragemPiso);
    if (suffixMax[t] <= limit) return { from: t, medianBefore, limit };
  }
  return null;
}

export function viewsZeradas(series: number[], zeragem: Zeragem | null, startAt?: Date): Evaluated {
  if (!zeragem) {
    return make(
      "views_zeradas",
      0,
      false,
      `A série não zera no fim: não há ${horas(LIMIARES.zeragemHoras)} ou mais seguidas perto de zero até o final.`,
    );
  }
  const tail = series.length - zeragem.from;
  return make(
    "views_zeradas",
    tail,
    true,
    `A partir ${describeHourFrom(zeragem.from, startAt)} e até o fim (${horas(tail)}), ` +
      `nenhuma hora passou de ${views(zeragem.limit)} views, contra mediana de ${views(zeragem.medianBefore)} views/h antes. ` +
      `Isso parece vídeo removido ou arquivado, não bot desligado (que devolve o público de antes). ` +
      `Os outros sinais olham só as ${horas(zeragem.from)} anteriores.`,
    `as views zeraram ${describeHour(zeragem.from, startAt)} e não voltaram, o que parece vídeo removido`,
  );
}

export function picoSobreMediana(ctx: Context): Evaluated {
  const peak = Math.max(...ctx.series);
  const ratio = peak / Math.max(ctx.median, 1);
  if (!ctx.event) {
    return make(
      "pico_sobre_mediana",
      ratio,
      false,
      `O maior valor (${views(peak)} views/h) é ${vezes(ratio)} a mediana (${views(ctx.median)} views/h). ` +
        `Abaixo de ${vezes(LIMIARES.picoSobreMediana)} não há pico para examinar.`,
    );
  }
  return make(
    "pico_sobre_mediana",
    ratio,
    true,
    `O pico foi de ${views(peak)} views/h ${describeHour(ctx.event.peakIndex, ctx.startAt)}, ` +
      `${vezes(ratio)} a mediana de ${views(ctx.median)} views/h. Sozinho isso não acusa nada: ` +
      `vídeo que estoura de verdade também faz isso. O que pesa é o formato do pico, nos outros sinais.`,
    `pico de ${vezes(ratio)} a mediana`,
  );
}

export function simetriaSubidaQueda(ctx: Context): Evaluated {
  const { series, event } = ctx;
  if (!event) {
    return make("simetria_subida_queda", null, false, "Não há pico acima do limiar, então não há subida e queda para comparar.");
  }
  if (event.start === 0 || event.end === series.length - 1) {
    return make(
      "simetria_subida_queda",
      null,
      false,
      "O pico encosta no começo ou no fim da série, então falta uma das bordas para comparar. Sinal não avaliado.",
    );
  }
  const antes = series[event.start - 1];
  const entrada = series[event.start];
  const saida = series[event.end];
  const depois = series[event.end + 1];
  // Cada borda em fração do caminho entre a mediana e o valor no topo daquela borda:
  // 100% na saída quer dizer que em 1 h voltou à mediana.
  const subida = Math.min(1, (entrada - antes) / (entrada - ctx.median));
  const queda = Math.min(1, (saida - depois) / (saida - ctx.median));
  const meiaVida = event.end + 1 - event.peakIndex;
  const value = Math.min(subida, queda);
  const bordas =
    `Na entrada do pico as views foram de ${views(antes)} para ${views(entrada)} em 1 h; na saída, de ${views(saida)} ` +
    `para ${views(depois)}, percorrendo em 1 h ${pct(Math.max(queda, 0))} do caminho de volta à mediana (${views(ctx.median)}).`;
  if (value >= LIMIARES.simetriaBordas) {
    return make(
      "simetria_subida_queda",
      value,
      true,
      `${bordas} Pico orgânico sobe rápido mas desce aos poucos; subir e voltar à mediana em 1 h cada ` +
        `(${pct(LIMIARES.simetriaBordas)} ou mais do caminho) parece tráfego ligado e desligado.`,
      `pico ligado e desligado (subiu de ${views(antes)} para ${views(entrada)} e caiu de ${views(saida)} para ${views(depois)}, cada um em 1 h)`,
    );
  }
  return make(
    "simetria_subida_queda",
    value,
    false,
    `${bordas} Levou ${horas(meiaVida)} do topo até cair à metade da altura. A descida é gradual, ` +
      `que é o formato de um vídeo que estourou.`,
  );
}

export function plato(ctx: Context): Evaluated {
  const x = ctx.series;
  const { volumeMinimo, platoTolerancia, platoHoras } = LIMIARES;
  let best = { length: 0, from: 0, lo: 0, hi: 0 };
  for (let i = 0; i < x.length; i++) {
    if (x[i] < volumeMinimo) continue;
    let lo = x[i];
    let hi = x[i];
    let j = i;
    while (j + 1 < x.length) {
      const nextLo = Math.min(lo, x[j + 1]);
      const nextHi = Math.max(hi, x[j + 1]);
      if (nextLo < volumeMinimo || nextHi > nextLo * (1 + platoTolerancia)) break;
      lo = nextLo;
      hi = nextHi;
      j++;
    }
    if (j - i + 1 > best.length) best = { length: j - i + 1, from: i, lo, hi };
  }
  if (best.length === 0) {
    return make("plato", null, false, `Nenhuma hora com pelo menos ${volumeMinimo} views; não dá para medir platô.`);
  }
  const variacao = best.hi / best.lo - 1;
  const trecho =
    `Por ${horas(best.length)} seguidas (a partir ${describeHourFrom(best.from, ctx.startAt)}) ` +
    `as views ficaram entre ${views(best.lo)} e ${views(best.hi)} por hora, variação de ${pct(variacao)}.`;
  if (best.length >= platoHoras) {
    return make(
      "plato",
      best.length,
      true,
      `${trecho} Público humano muda com a hora do dia; ${horas(platoHoras)} ou mais dentro de ${pct(platoTolerancia)} é platô de tráfego fixo.`,
      `platô de ${horas(best.length)} com variação de ${pct(variacao)}`,
    );
  }
  return make(
    "plato",
    best.length,
    false,
    `O trecho mais estável teve ${horas(best.length)} dentro de ${pct(platoTolerancia)}, abaixo de ${horas(platoHoras)}: sem platô.`,
  );
}

export function quedaAbrupta(ctx: Context): Evaluated {
  const x = ctx.series;
  let best: { drop: number; t: number; before: number; after: number } | null = null;
  for (let t = 2; t < x.length - 1; t++) {
    const before = Math.min(x[t - 2], x[t - 1]);
    if (before < LIMIARES.volumeMinimo) continue;
    const after = Math.max(x[t], x[t + 1]);
    const drop = 1 - after / before;
    if (!best || drop > best.drop) best = { drop, t, before, after };
  }
  if (!best) {
    return make(
      "queda_abrupta",
      null,
      false,
      `Nenhum par de horas com pelo menos ${LIMIARES.volumeMinimo} views; volume baixo demais para medir queda.`,
    );
  }
  const quando = describeHour(best.t, ctx.startAt);
  const drop = Math.max(best.drop, 0);
  if (drop >= LIMIARES.quedaAbrupta) {
    return make(
      "queda_abrupta",
      drop,
      true,
      `As duas horas antes ${describeHourFrom(best.t, ctx.startAt)} tiveram pelo menos ${views(best.before)} views cada; as duas seguintes, no máximo ` +
        `${views(best.after)} (−${pct(drop)}). Cair mais de ${pct(LIMIARES.quedaAbrupta)} em 1 h e continuar baixo ` +
        `é o que acontece quando tráfego comprado é desligado.`,
      `queda de ${pct(drop)} em 1 h ${quando}, sem recuperação`,
    );
  }
  return make(
    "queda_abrupta",
    drop,
    false,
    `A maior queda sustentada de uma hora para a outra foi de ${pct(drop)} (${quando}), abaixo de ${pct(LIMIARES.quedaAbrupta)}: as quedas são graduais.`,
  );
}

export function ritmoCircadiano(ctx: Context): Evaluated {
  if (!ctx.hours) {
    return make(
      "ritmo_circadiano",
      null,
      false,
      "Sem start_at não dá para saber que horas eram em São Paulo; sinal não avaliado.",
    );
  }
  const hours = ctx.hours;
  const pick = (de: number, ate: number) => ctx.series.filter((_, i) => hours[i] >= de && hours[i] <= ate);
  const madrugada = median(pick(MADRUGADA.de, MADRUGADA.ate));
  const tarde = median(pick(TARDE_E_NOITE.de, TARDE_E_NOITE.ate));
  if (!(tarde > 0)) {
    return make("ritmo_circadiano", null, false, "Sem views à tarde e à noite para comparar com a madrugada; sinal não avaliado.");
  }
  const ratio = madrugada / tarde;
  const trecho =
    `Na madrugada (${MADRUGADA.de}h–${MADRUGADA.ate}h em São Paulo) a hora típica (mediana) teve ${views(madrugada)} views, ` +
    `${pct(ratio)} da hora típica de tarde e noite (${TARDE_E_NOITE.de}h–${TARDE_E_NOITE.ate}h, ${views(tarde)} views).`;
  if (ratio >= LIMIARES.ritmoMadrugada) {
    return make(
      "ritmo_circadiano",
      ratio,
      true,
      `${trecho} Com público no Brasil a madrugada fica abaixo de ${pct(LIMIARES.ritmoMadrugada)}; aqui a série ignora o dia e a noite.`,
      `madrugada com ${pct(ratio)} do movimento da tarde e noite`,
    );
  }
  return make("ritmo_circadiano", ratio, false, `${trecho} Segue o dia e a noite de São Paulo.`);
}

function naMadrugada(hour: number): boolean {
  return hour >= MADRUGADA.de && hour <= MADRUGADA.ate;
}

export function picoNaMadrugada(ctx: Context): Evaluated {
  const { event, hours, series } = ctx;
  if (!event) return make("pico_na_madrugada", null, false, "Não há pico acima do limiar; sinal não avaliado.");
  if (!hours) {
    return make("pico_na_madrugada", null, false, "Sem start_at não dá para saber em que hora de São Paulo foi o pico; sinal não avaliado.");
  }
  let total = 0;
  let night = 0;
  for (let t = event.start; t <= event.end; t++) {
    const excess = Math.max(0, series[t] - ctx.median);
    total += excess;
    if (naMadrugada(hours[t])) night += excess;
  }
  const share = total > 0 ? night / total : 0;
  const trecho =
    `Das views acima da mediana durante o pico (${describeHourFrom(event.start, ctx.startAt)} ` +
    `${describeHour(event.end, ctx.startAt)}), ${pct(share)} caíram na madrugada ` +
    `(${MADRUGADA.de}h–${MADRUGADA.ate}h em São Paulo).`;
  if (share >= LIMIARES.picoNaMadrugada) {
    return make(
      "pico_na_madrugada",
      share,
      true,
      `${trecho} Pico orgânico de público brasileiro acontece de dia e à noite; ${pct(LIMIARES.picoNaMadrugada)} ou mais na madrugada é fora de hora.`,
      `${pct(share)} do pico caiu na madrugada`,
    );
  }
  return make("pico_na_madrugada", share, false, `${trecho} O pico aconteceu em horário de público acordado.`);
}

export function coeficienteVariacao(ctx: Context): Evaluated {
  const avg = mean(ctx.series);
  if (avg === 0) return make("coeficiente_variacao", null, false, "Série sem views; sinal não avaliado.");
  const std = Math.sqrt(mean(ctx.series.map((v) => (v - avg) ** 2)));
  const cv = std / avg;
  if (cv < LIMIARES.coeficienteVariacao) {
    return make(
      "coeficiente_variacao",
      cv,
      true,
      `As views variam só ${pct(cv)} em torno da média de ${views(avg)} views/h. Abaixo de ${pct(LIMIARES.coeficienteVariacao)} ` +
        `é regular demais: público humano oscila com o dia, a noite e o acaso.`,
      `variação de só ${pct(cv)} em torno da média`,
    );
  }
  return make(
    "coeficiente_variacao",
    cv,
    false,
    `As views variam ${pct(cv)} em torno da média de ${views(avg)} views/h, acima de ${pct(LIMIARES.coeficienteVariacao)}: oscilação normal.`,
  );
}

function lowVolume(name: SignalName, ctx: Context): Evaluated {
  return make(
    name,
    null,
    false,
    `Mediana de ${views(ctx.median)} views/h, abaixo de ${LIMIARES.volumeMinimo}: com tão poucas views, números iguais aparecem por acaso. Sinal não avaliado.`,
  );
}

export function valoresRepetidos(ctx: Context): Evaluated {
  if (ctx.median < LIMIARES.volumeMinimo) return lowVolume("valores_repetidos", ctx);
  const counts = new Map<number, number>();
  for (const v of ctx.series) counts.set(v, (counts.get(v) ?? 0) + 1);
  let mode = 0;
  let count = 0;
  for (const [v, c] of counts) {
    if (c > count) {
      mode = v;
      count = c;
    }
  }
  const share = count / ctx.series.length;
  const trecho = `O valor mais frequente (${views(mode)} views) aparece em ${count} de ${ctx.series.length} horas (${pct(share)}).`;
  if (share >= LIMIARES.valoresRepetidos) {
    return make(
      "valores_repetidos",
      share,
      true,
      `${trecho} Com mediana de ${views(ctx.median)} views/h, o mesmo número exato em ${pct(LIMIARES.valoresRepetidos)} ou mais das horas não é acaso.`,
      `o mesmo valor (${views(mode)}) em ${pct(share)} das horas`,
    );
  }
  return make("valores_repetidos", share, false, `${trecho} Abaixo de ${pct(LIMIARES.valoresRepetidos)}: sem repetição suspeita.`);
}

export function periodicidadeExata(ctx: Context): Evaluated {
  if (ctx.median < LIMIARES.volumeMinimo) return lowVolume("periodicidade_exata", ctx);
  const x = ctx.series;
  let best = { share: 0, lag: 1 };
  const maxLag = Math.min(LIMIARES.periodicidadeLagMax, Math.floor(x.length / 2));
  for (let lag = 1; lag <= maxLag; lag++) {
    let equal = 0;
    for (let t = lag; t < x.length; t++) if (x[t] === x[t - lag]) equal++;
    const share = equal / (x.length - lag);
    if (share > best.share) best = { share, lag };
  }
  const trecho = `Em ${pct(best.share)} das horas as views são exatamente iguais às de ${horas(best.lag)} antes.`;
  if (best.share >= LIMIARES.periodicidadeExata) {
    return make(
      "periodicidade_exata",
      best.share,
      true,
      `${trecho} Acima de ${pct(LIMIARES.periodicidadeExata)} é um ciclo mecânico: público humano não repete o número exato.`,
      `ciclo exato de ${horas(best.lag)} em ${pct(best.share)} das horas`,
    );
  }
  return make("periodicidade_exata", best.share, false, `${trecho} Abaixo de ${pct(LIMIARES.periodicidadeExata)}: sem ciclo mecânico.`);
}
