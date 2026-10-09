// Cada limiar abaixo é documentado no README, com o motivo do valor.
export const LIMIARES = {
  // Abaixo de dois ciclos de dia e noite não dá para comparar madrugada com tarde.
  minHoras: 48,
  maxHoras: 24 * 90,
  // Mediana mínima (views/h) para julgar repetição exata: com poucas views,
  // números iguais aparecem por acaso.
  volumeMinimo: 20,
  // Zeragem: a partir de uma hora, todas as seguintes ficam abaixo de max(10% da mediana anterior, 5 views),
  // por pelo menos 6 h. Parece vídeo removido; bot desligado devolve o público de antes (na madrugada,
  // uns 30% da mediana), não zero.
  zeragemFracao: 0.1,
  zeragemPiso: 5,
  zeragemHoras: 6,
  // Contexto: acima disso existe um pico para examinar. Não acusa nada sozinho.
  picoSobreMediana: 4,
  // Menor das duas bordas do pico, cada uma em fração do caminho entre a mediana e o topo da borda.
  simetriaBordas: 0.8,
  // Platô: horas seguidas com máximo/mínimo dentro da tolerância.
  platoHoras: 12,
  platoTolerancia: 0.15,
  // Queda sustentada em 1 h: as duas horas seguintes ficam abaixo de (1 - limiar) das duas anteriores.
  quedaAbrupta: 0.7,
  // Mediana das horas de madrugada (1h-5h) dividida pela mediana de tarde e noite (12h-23h), em São Paulo.
  // Mediana, e não média, para um pico curto não decidir sozinho o ritmo do dia.
  ritmoMadrugada: 0.7,
  // Fração das views acima da mediana, dentro do pico, que caiu na madrugada (1h-5h) de São Paulo.
  picoNaMadrugada: 0.5,
  // Desvio padrão / média da série inteira.
  coeficienteVariacao: 0.1,
  // Fração das horas com o valor mais frequente.
  valoresRepetidos: 0.25,
  // Fração das horas exatamente iguais às de k horas antes, no melhor k de 1 a 48.
  periodicidadeExata: 0.5,
  periodicidadeLagMax: 48,
} as const;

export const MADRUGADA = { de: 1, ate: 5 } as const;
export const TARDE_E_NOITE = { de: 12, ate: 23 } as const;
