export const HOUR_MS = 3_600_000;
export const TIME_ZONE = "America/Sao_Paulo";

const hourFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" });
const labelFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function saoPauloHours(startAt: Date, count: number): number[] {
  const start = startAt.getTime();
  return Array.from({ length: count }, (_, i) => Number(hourFormat.format(new Date(start + i * HOUR_MS))));
}

export function describeHour(index: number, startAt?: Date): string {
  if (!startAt) return `na hora ${index} da série`;
  const parts = labelFormat.formatToParts(new Date(startAt.getTime() + index * HOUR_MS));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `às ${part("hour")}h de ${part("day")}/${part("month")}`;
}

// "das 08h de 11/09" ou "da hora 57 da série", para frases como "a partir das..." e "antes das...".
export function describeHourFrom(index: number, startAt?: Date): string {
  return describeHour(index, startAt).replace(/^às /, "das ").replace(/^na /, "da ");
}
