const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function views(value: number): string {
  return inteiro.format(Math.round(value));
}

export function vezes(value: number): string {
  return `${decimal.format(value)}×`;
}

export function pct(fraction: number): string {
  return `${inteiro.format(Math.round(fraction * 100))}%`;
}

export function horas(value: number): string {
  return value === 1 ? "1 h" : `${inteiro.format(value)} h`;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
