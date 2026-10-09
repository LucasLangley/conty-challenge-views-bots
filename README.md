# Conty. Views que não parecem humanas

A marca paga o criador por alcance. Esta API recebe a série de views por hora de um vídeo e diz se o número parece de gente (`legitimo`), parece comprado ou mecânico (`suspeito`) ou se não dá para afirmar (`inconclusivo`). Junto vem um motivo em português, com números, e todos os sinais que entraram na conta, cada um com valor, limiar e explicação. Não tem modelo treinado: são regras pequenas, com limiares nomeados em [`src/domain/thresholds.ts`](src/domain/thresholds.ts).

O princípio é que acusar um criador honesto custa mais do que deixar passar um caso duvidoso. Um sinal sozinho nunca acusa. Para ser suspeito é preciso ter duas hipóteses independentes de tráfego não humano ou repetição exata de valores. Sinais que medem a mesma coisa (por exemplo, o pico terminar de uma vez) contam como uma hipótese só.

## Como rodar

Node 22.

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run eval      # gera o dataset e mede falso positivo, recall e inconclusivos
npm run dev       # API em http://127.0.0.1:3009 (PORT muda a porta)
```

## Endpoints

### `POST /classify`

Corpo: `series` (lista de views por hora, números ≥ 0, até 2.160 horas) e `start_at` opcional (ISO 8601, o instante da primeira hora). Sem `start_at`, os dois sinais que dependem do relógio de São Paulo ficam como não avaliados e o resto vale igual.

Exemplos gerados rodando o app (`npm start`) com séries de 72 h a partir de segunda, 00h em São Paulo.

**Pico comprado**: cinco horas de bots a partir das 02h de quarta.

```bash
curl -s -X POST http://127.0.0.1:3009/classify -H 'content-type: application/json' -d '{"series":[76,72,41,44,25,23,28,48,77,62,57,82,71,86,55,93,98,105,89,118,102,140,107,106,94,75,46,27,29,22,20,40,52,57,68,83,104,78,71,93,81,93,129,104,98,107,98,105,107,68,1325,1348,1338,1355,1332,39,50,66,70,71,92,98,81,72,103,83,108,112,112,120,122,87],"start_at":"2026-09-07T03:00:00.000Z"}'
```

```json
{
  "label": "suspeito",
  "reason": "Suspeito: 2 hipóteses independentes de tráfego não humano. As views pararam de uma vez: pico ligado e desligado (subiu de 68 para 1.325 e caiu de 1.332 para 39, cada um em 1 h); queda de 96% em 1 h às 07h de 09/09, sem recuperação. O horário não bate com público em São Paulo: 80% do pico caiu na madrugada.",
  "signals": [
    { "name": "views_zeradas", "value": 0, "threshold": 6, "triggered": false,
      "explanation": "A série não zera no fim: não há 6 h ou mais seguidas perto de zero até o final." },
    { "name": "pico_sobre_mediana", "value": 16.325, "threshold": 4, "triggered": true,
      "explanation": "O pico foi de 1.355 views/h às 05h de 09/09, 16,3× a mediana de 83 views/h. Sozinho isso não acusa nada: vídeo que estoura de verdade também faz isso. O que pesa é o formato do pico, nos outros sinais." },
    { "name": "simetria_subida_queda", "value": 1, "threshold": 0.8, "triggered": true,
      "explanation": "Na entrada do pico as views foram de 68 para 1.325 em 1 h; na saída, de 1.332 para 39, percorrendo em 1 h 100% do caminho de volta à mediana (83). Pico orgânico sobe rápido mas desce aos poucos; subir e voltar à mediana em 1 h cada (80% ou mais do caminho) parece tráfego ligado e desligado." },
    { "name": "plato", "value": 6, "threshold": 12, "triggered": false,
      "explanation": "O trecho mais estável teve 6 h dentro de 15%, abaixo de 12 h: sem platô." },
    { "name": "queda_abrupta", "value": 0.962, "threshold": 0.7, "triggered": true,
      "explanation": "As duas horas antes das 07h de 09/09 tiveram pelo menos 1.332 views cada; as duas seguintes, no máximo 50 (−96%). Cair mais de 70% em 1 h e continuar baixo é o que acontece quando tráfego comprado é desligado." },
    { "name": "ritmo_circadiano", "value": 0.469, "threshold": 0.7, "triggered": false,
      "explanation": "Na madrugada (1h–5h em São Paulo) a hora típica (mediana) teve 46 views, 47% da hora típica de tarde e noite (12h–23h, 98 views). Segue o dia e a noite de São Paulo." },
    { "name": "pico_na_madrugada", "value": 0.801, "threshold": 0.5, "triggered": true,
      "explanation": "Das views acima da mediana durante o pico (das 02h de 09/09 às 06h de 09/09), 80% caíram na madrugada (1h–5h em São Paulo). Pico orgânico de público brasileiro acontece de dia e à noite; 50% ou mais na madrugada é fora de hora." },
    { "name": "coeficiente_variacao", "value": 1.941, "threshold": 0.1, "triggered": false,
      "explanation": "As views variam 194% em torno da média de 166 views/h, acima de 10%: oscilação normal." },
    { "name": "valores_repetidos", "value": 0.056, "threshold": 0.25, "triggered": false,
      "explanation": "O valor mais frequente (98 views) aparece em 4 de 72 horas (6%). Abaixo de 25%: sem repetição suspeita." },
    { "name": "periodicidade_exata", "value": 0.071, "threshold": 0.5, "triggered": false,
      "explanation": "Em 7% das horas as views são exatamente iguais às de 30 h antes. Abaixo de 50%: sem ciclo mecânico." }
  ]
}
```

**Vídeo que estourou de verdade**: mesmo público, pico de altura parecida às 18h de terça. Abaixo estão só `label` e `reason`; os `signals` vêm completos como no exemplo acima.

```bash
curl -s -X POST http://127.0.0.1:3009/classify -H 'content-type: application/json' -d '{"series":[76,72,41,44,25,23,28,48,77,62,57,82,71,86,55,93,98,105,89,118,102,140,107,106,94,75,46,27,29,22,20,40,52,57,68,83,104,78,71,93,81,93,867,1307,1318,1225,1245,1008,881,521,316,231,145,155,153,221,300,341,325,346,373,413,250,259,262,342,302,260,318,243,236,182],"start_at":"2026-09-07T03:00:00.000Z"}'
```

```json
{
  "label": "legitimo",
  "reason": "Legítimo: nenhum dos 8 sinais de tráfego não humano avaliados disparou. Há um pico de 12,8× a mediana, mas com formato de vídeo que estourou: sobe rápido e desce aos poucos. A madrugada teve 29% do movimento da tarde e noite, como público humano no Brasil."
}
```

**Público de outro fuso**: a madrugada de São Paulo é quase tão movimentada quanto a tarde, e nada mais é estranho.

```bash
curl -s -X POST http://127.0.0.1:3009/classify -H 'content-type: application/json' -d '{"series":[149,120,112,113,120,114,130,129,137,139,131,133,100,199,153,143,158,118,147,139,156,158,183,165,177,141,133,140,112,149,90,112,158,181,144,142,155,134,143,145,172,169,166,179,150,141,169,144,124,110,129,153,119,126,113,100,126,95,141,149,146,135,176,123,114,111,135,128,132,125,148,106],"start_at":"2026-09-07T03:00:00.000Z"}'
```

```json
{
  "label": "inconclusivo",
  "reason": "Inconclusivo: só uma hipótese de tráfego não humano apareceu, o horário não bate com público em São Paulo (madrugada com 82% do movimento da tarde e noite), e uma hipótese sozinha não basta para acusar. Pode ser público de outro fuso horário, ou um vídeo que estourou fora do Brasil. Os demais sinais avaliados estão dentro do esperado."
}
```

**Série curta** (200) e **valor inválido** (400):

```bash
curl -s -X POST http://127.0.0.1:3009/classify -H 'content-type: application/json' -d '{"series":[120,95,90],"start_at":"2026-09-07T03:00:00Z"}'
# {"label":"inconclusivo","reason":"Inconclusivo: a série tem 3 h. Com menos de 48 h não há dois ciclos de dia e noite para comparar, então não classifico.","signals":[]}

curl -s -X POST http://127.0.0.1:3009/classify -H 'content-type: application/json' -d '{"series":[120,-3,90]}'
# HTTP 400 {"error":"cada hora de series deve ser um número maior ou igual a zero"}
```

### `GET /health`

`{"ok":true}`

## Como decide

1. Menos de 48 h, ou série toda zerada: `inconclusivo`, sem sinais.
2. Se a série **zera e não volta** (6 h ou mais até o fim abaixo de 10% da mediana anterior, com piso de 5 views), isso parece vídeo removido ou arquivado, não bot desligado: bot desligado devolve o público de antes, que de madrugada é uns 30% da mediana. Os outros sinais olham só as horas antes da zeragem, e o motivo avisa.
3. Calcula os sinais. Cada um tem um peso:
   - **contexto** (`views_zeradas`, `pico_sobre_mediana`): mostra o que há para examinar, nunca acusa;
   - **forte** (`valores_repetidos`, `periodicidade_exata`): repetição do número exato, que público humano não produz com mediana acima de 20 views/h. Sozinho já torna suspeito;
   - **fraco** (os outros seis).
4. Sinais fracos que nascem da mesma hipótese contam uma vez só (mapa `HIPOTESE` em [`src/domain/signals.ts`](src/domain/signals.ts)):
   - **as views pararam de uma vez** = `simetria_subida_queda` + `queda_abrupta`. Os dois medem o fim do pico em 1 h; live, estreia e vídeo que o algoritmo para de recomendar disparam os dois juntos.
   - **série plana demais** = `plato` + `coeficiente_variacao`. Os dois medem falta de variação, num trecho e na série inteira; público grande e estável explica os dois ao mesmo tempo.
   - **horário não bate com público em São Paulo** = `ritmo_circadiano` + `pico_na_madrugada`. Os dois supõem público no Brasil; com público em outro fuso disparam juntos.
   - Pares revistos e mantidos separados: `pico_sobre_mediana` com qualquer outro (é contexto, nunca conta); `pico_na_madrugada` × fim do pico (um mede a hora, o outro o formato); `plato` × `queda_abrupta` (platô pode acabar aos poucos, e queda pode vir sem platô); `plato` × `ritmo_circadiano` (público de vários fusos dispara o ritmo sempre, mas 12 h dentro de 15% só por acaso: 1 de 40 `audiencia_global`, o falso positivo conhecido).
5. Um sinal forte ou duas hipóteses fracas independentes: `suspeito`. Uma hipótese fraca (com um ou dois sinais): `inconclusivo`, e o motivo diz o que mais a explicaria (live, outro fuso, público estável). Nenhum sinal, mas mediana abaixo de 20 views/h: `inconclusivo`, porque com tão pouco volume não dá para avaliar repetição. Nenhum: `legitimo`.

## Sinais e limiares

Limiares em [`src/domain/thresholds.ts`](src/domain/thresholds.ts). "Mediana" é a mediana da série inteira (ou da parte antes da zeragem).

| Sinal | O que mede | Dispara quando | Por que esse valor |
|---|---|---|---|
| `pico_sobre_mediana` (contexto) | maior hora ÷ mediana | ≥ 4 | Abaixo disso a variação de dia e noite já explica. Define o "pico" (horas em volta do máximo acima da metade da altura), usado pelos dois sinais seguintes. |
| `simetria_subida_queda` | menor das duas bordas do pico: quanto do caminho até a mediana a série percorre em 1 h ao entrar e ao sair. O detalhe cita a meia-vida (horas do topo até a metade) | ≥ 80% | Viral sobe de uma vez, mas na primeira hora da descida ainda fica bem acima da mediana (nos legítimos centrais do dataset, no máximo 56% do caminho). Bot desligado volta à mediana em 1 h (nos suspeitos centrais, 86% ou mais). |
| `plato` | maior sequência de horas com máximo/mínimo dentro de 15% (só horas com 20+ views) | ≥ 12 h | Meio dia sem mudar é incompatível com dia e noite. Nos legítimos centrais o maior platô foi de 9 h; com limiar de 6 h, as tardes, que são naturalmente planas, disparavam. |
| `queda_abrupta` | 1 − (maior das 2 horas seguintes ÷ menor das 2 anteriores), com as anteriores tendo 20+ views | ≥ 70% | A pior queda orgânica nos legítimos centrais (virada da noite para a madrugada, com ruído) foi de 71%: o limiar está no limite, e essa série virou `inconclusivo`, não suspeita. Duas horas de cada lado evitam que uma hora ruidosa decida. |
| `ritmo_circadiano` | mediana das horas de 1h–5h ÷ mediana das horas de 12h–23h, em São Paulo | ≥ 70% | Público no Brasil sem pico (`organico_estavel`): 29–38%. Bots planos: ~100%. Mediana, e não média, para um pico curto não decidir o ritmo. |
| `pico_na_madrugada` | fração das views acima da mediana, dentro do pico, que caiu entre 1h e 5h | ≥ 50% | Viral de público brasileiro é amortecido de madrugada; compra programada de madrugada não. |
| `coeficiente_variacao` | desvio padrão ÷ média | < 10% | Público com dia e noite de São Paulo ficou acima de 39% no dataset; mesmo o público global, acima de 17%. |
| `valores_repetidos` (forte) | fração das horas com o valor mais frequente, se a mediana ≥ 20 | ≥ 25% | Com mediana 20, a chance de duas horas terem o mesmo número é de poucos %. |
| `periodicidade_exata` (forte) | melhor k de 1 a 48: fração das horas idênticas às de k horas antes, se a mediana ≥ 20 | ≥ 50% | Pega o bot que copia um dia "humano" e repete: segue o ritmo, varia bastante, mas é cópia exata. |

## Dataset sintético e números

`npm run eval` gera `dataset/series.jsonl` (600 séries, uma por linha, com `generator`, `truth`, `start_at` e `series`), classifica tudo e grava `dataset/eval.json`. Cada série tem seed própria derivada de `(20261009, gerador, índice)` via mulberry32; nada usa `Math.random` nem dado de rede social real. Séries de 96 a 336 horas, começando em horas variadas de setembro de 2026.

O público humano é simulado com uma curva de dia e noite de São Paulo (pico 20h–21h, vale 4h–5h com 20% do pico), variação de ±8% por dia, ruído multiplicativo de 8–18% por hora e contagem de Poisson. Os geradores marcados com * são limítrofes, feitos para errar.

| Gerador | Verdade | Como é |
|---|---|---|
| `organico_estavel` | legítimo | público no Brasil, dia e noite, ruído |
| `viral_organico` | legítimo | pico de 5× a 40× que sobe em 1–3 h e decai com meia-vida de 4–36 h, seguindo o dia e a noite |
| `crescimento_lento` | legítimo | audiência que cresce 2× a 6× ao longo da série |
| `viral_rapido`* | legítimo | viral com meia-vida de 1,5–3 h |
| `audiencia_global`* | legítimo | dia e noite achatados (público em vários fusos), metade com viral |
| `baixo_volume`* | legítimo | 2 a 25 views/h no horário nobre |
| `video_removido`* | legítimo | viral que zera de repente (removido ou arquivado) |
| `viral_cortado`* | legítimo | viral que sai da recomendação 2–6 h depois do topo: volta de uma vez ao público de antes |
| `live_estreia`* | legítimo | live ou estreia de 1–3 h começando entre 19h e 21h, a 5×–30× o horário nobre: entra e sai de uma vez |
| `pico_comprado` | suspeito | bloco de 3–12 h a 3×–20× o horário nobre, nível fixo, metade de madrugada |
| `plato_bots` | suspeito | platô de 24–120 h a 1,5×–6× o horário nobre, sem dia e noite |
| `repeticao_mecanica` | suspeito | só bots: valor constante, ciclo exato repetido, ou ruído de 0,5% |
| `queda_abrupta` | suspeito | bots de 2×–8× ligados no início e desligados de uma vez |
| `pico_comprado_pequeno`* | suspeito | bloco de 2–4 h a 1×–2,5× o horário nobre |
| `bots_imitando_ritmo`* | suspeito | bots que seguem o dia e a noite, com 15% de ruído e rampa de 6 h |

Saída de `npm run eval`:

```
gerador                 verdade    legitimo  inconcl.  suspeito
organico_estavel        legitimo   39        1         0
viral_organico          legitimo   39        1         0
crescimento_lento       legitimo   40        0         0
viral_rapido*           legitimo   35        5         0
audiencia_global*       legitimo   1         38        1
baixo_volume*           legitimo   2         38        0
video_removido*         legitimo   33        7         0
viral_cortado*          legitimo   0         35        5
live_estreia*           legitimo   0         40        0
pico_comprado           suspeito   0         20        20
plato_bots              suspeito   1         7         32
repeticao_mecanica      suspeito   0         0         40
queda_abrupta           suspeito   0         3         37
pico_comprado_pequeno*  suspeito   17        21        2
bots_imitando_ritmo*    suspeito   40        0         0
* limítrofe

taxa de falso positivo: 1,7% (6 de 360 legítimos)
recall dos suspeitos:   54,6% (131 de 240)
inconclusivos:          216 (165 legítimos, 51 suspeitos)
só geradores centrais:  falso positivo 0,0%, recall 80,6%
falsos positivos: audiencia_global-023, viral_cortado-003, viral_cortado-007, viral_cortado-030, viral_cortado-035, viral_cortado-037
```

- **Taxa de falso positivo esperada no dataset** (legítimos classificados como suspeito ÷ legítimos): <!-- eval:taxa_falso_positivo -->1,7%<!-- /eval -->
- **Recall dos suspeitos** (suspeitos classificados como suspeito ÷ suspeitos): <!-- eval:recall -->54,6%<!-- /eval -->
- **Inconclusivos** (das 600 séries): <!-- eval:inconclusivos -->216<!-- /eval -->

Os três números acima ficam entre marcadores fixos. O teste [`test/readme.test.ts`](test/readme.test.ts) roda a avaliação, lê os marcadores e falha se divergirem. Outro teste falha se `dataset/series.jsonl` não for o que o gerador produz hoje.

Antes de juntar as hipóteses, `simetria_subida_queda` e `queda_abrupta` contavam como dois sinais independentes. Com os dois geradores novos (`viral_cortado` e `live_estreia`) no dataset, isso dava falso positivo de 10,6% (38 de 360: 13 virais cortados, 24 lives e o `audiencia_global-023`), recall de 68,3% e 151 inconclusivos. Depois de juntar: 1,7%, 54,6% e 216. Nenhum limiar mudou.

Os falsos positivos que sobraram:
- `audiencia_global-023`: público de vários fusos que, por acaso, passou 12 h dentro de 13% de variação: platô e ritmo dispararam juntos.
- Cinco `viral_cortado` com o topo à 1h ou às 2h de São Paulo: o pico terminou de uma vez **e** caiu na madrugada. São duas hipóteses de fato diferentes (formato e horário), e juntas batem com uma compra de madrugada que foi desligada.

O recall caiu porque compra em bloco em horário de público acordado tem o mesmo formato de uma live: sobe e desce em 1 h, e nada mais é estranho. Isso levou a `inconclusivo` os 20 `pico_comprado` fora da madrugada e 3 dos `queda_abrupta`. É a troca escolhida: na dúvida entre live e compra, não acuso. O recall total também é baixo porque os dois geradores limítrofes de suspeitos foram feitos para passar (veja abaixo). Nos geradores centrais o recall é de 80,6%.

Calibrei os limiares olhando esta seed. Para não ficar só nela, rodei a mesma avaliação com as seeds 1, 2, 3 e 42 (com os 15 geradores): falso positivo entre 1,1% e 2,2% (antes de juntar as hipóteses, entre 10,0% e 12,2%), recall entre 51% e 55%. Só nos 7 geradores legítimos antigos, o falso positivo ficou entre 0,0% e 0,7%, a mesma faixa de antes. Esses números não saem do `npm run eval` e não estão sob teste.

## Onde ele prefere não acusar

- **Volume baixo**: com mediana abaixo de 20 views/h, números iguais aparecem por acaso, então a repetição não é avaliada e, sem outro sinal, o resultado é `inconclusivo`. É o caso de 38 dos 40 `baixo_volume`.
- **Uma hipótese só**: o motivo diz qual foi e o que mais a explicaria (outro fuso, live, público estável). É o caso de quase todo `audiencia_global`: madrugada movimentada, nada mais estranho.
- **Live, estreia ou viral que sai da recomendação**: o pico entra e sai de uma vez, em horário de público acordado. `simetria_subida_queda` e `queda_abrupta` disparam juntos e contam como uma hipótese, então o resultado é `inconclusivo` com "pode ser uma live ou estreia". Live de 1 h e de 2 h recebem o mesmo motivo, mesmo a de 2 h disparando um sinal a mais. São as 40 `live_estreia` e 35 dos 40 `viral_cortado`.
- **Série curta** (menos de 48 h) ou **zerada antes de 48 h**.

## O que ele NÃO detecta

- **Bots que imitam o dia e a noite, com ruído e rampa** (`bots_imitando_ritmo`): 0 de 40. Nenhum sinal olha para o formato do dia ou para a origem do tráfego. Para pegar esse caso seria preciso um dado que a série não tem (retenção, origem, contas).
- **Compra em bloco em horário de público acordado**: sobe e desce em 1 h, igual a uma live. Sem outro sinal (madrugada, platô, repetição), vira `inconclusivo`: 20 de 40 `pico_comprado` e 3 de 40 `queda_abrupta`. Separar isso de uma live exigiria saber se houve live (dado da plataforma) ou o histórico do criador.
- **Compra pequena** (`pico_comprado_pequeno`, 1×–2,5× o horário nobre): 2 de 40 suspeitos, 17 passam como legítimos. Abaixo de 4× a mediana não existe "pico", e as bordas somem no ruído.
- **Bots misturados ao público em proporção pequena e constante**: só sobem o nível. Nada no formato muda.
- **Viral que estoura de madrugada e sai da recomendação** é acusado: formato e horário são duas hipóteses independentes, e as duas batem com compra de madrugada desligada (5 de 40 `viral_cortado`).
- **Público fora de São Paulo**: os dois sinais de fuso supõem público no Brasil. Por isso contam como um só e não acusam sozinhos, mas ainda podem somar com outro sinal (o falso positivo acima).
- O dataset é sintético e foi feito por mim, com as mesmas hipóteses que guiaram as regras. A taxa medida mostra a coerência entre classificador e geradores, não a taxa no mundo real.

## Decisões

- Classificador puro em `src/domain/` (sem HTTP, sem relógio do sistema). A rota só valida e chama. Nada depende da hora atual, então não há `Clock`: o tempo que importa é o `start_at` enviado.
- Fuso `America/Sao_Paulo` via `Intl`, por hora. Isso cobre o horário de verão de séries antigas.
- Sem persistência: a classificação é uma função da série e não guarda estado.
- `value` sai com 3 casas e `null` quando o sinal não foi avaliado (o `explanation` diz por quê).
- Série com 2.161 horas ou mais (90 dias) responde 400.

## O que ficou de fora e o que faria com mais tempo

- Validar os limiares com séries reais rotuladas. Hoje eles vêm do dataset sintético.
- Pedir o fuso do público (ou estimar pela própria série) em vez de supor São Paulo.
- Um sinal que reconheça lives e estreias (começo em hora redonda, duração típica, histórico de lives do criador), para separar delas a compra em bloco feita de dia.
- Comparar o vídeo com o histórico do próprio criador. Esse é o sinal mais forte que falta.
- Expor `npm run eval -- --seed N` para medir a variação entre seeds pelo comando, não à mão.

## Uso de IA

Implementação, testes e README escritos com Claude Code (IA da Anthropic) a partir do enunciado. O que eu revisei: _(a preencher)_
