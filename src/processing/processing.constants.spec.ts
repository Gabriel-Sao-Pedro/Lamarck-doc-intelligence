import { parsePositiveIntervalMs } from './processing.constants.js';

describe('parsePositiveIntervalMs', () => {
  const fallback = 1000;

  it('aceita um valor inteiro positivo válido', () => {
    expect(parsePositiveIntervalMs('5000', fallback)).toBe(5000);
  });

  it('usa o fallback quando o valor é "0"', () => {
    expect(parsePositiveIntervalMs('0', fallback)).toBe(fallback);
  });

  it('usa o fallback quando o valor é negativo', () => {
    expect(parsePositiveIntervalMs('-100', fallback)).toBe(fallback);
  });

  it('usa o fallback quando o valor é texto inválido', () => {
    expect(parsePositiveIntervalMs('abc', fallback)).toBe(fallback);
  });

  it('usa o fallback quando a variável está ausente', () => {
    expect(parsePositiveIntervalMs(undefined, fallback)).toBe(fallback);
  });

  it('usa o fallback para valor decimal', () => {
    expect(parsePositiveIntervalMs('12.5', fallback)).toBe(fallback);
  });

  it('usa o fallback para Infinity', () => {
    expect(parsePositiveIntervalMs('Infinity', fallback)).toBe(fallback);
  });
});
