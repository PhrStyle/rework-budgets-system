/**
 * Gerador pseudoaleatório determinístico (mulberry32): a mesma semente produz sempre a mesma
 * sequência, em qualquer máquina. Só aritmética inteira de 32 bits; nada de `Math.random()`.
 */
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
  /** Inteiro em [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Inteiro em [min, max] que seja múltiplo de `step`. */
  step(min: number, max: number, step: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Escolhe pelo peso: `[[valor, peso], ...]`. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const pick = <T>(items: readonly T[]): T => {
    const value = items[int(0, items.length - 1)];
    if (value === undefined) throw new RangeError('pick em lista vazia');
    return value;
  };

  return {
    next,
    int,
    step: (min, max, step) => int(min / step, max / step) * step,
    chance: (probability) => next() < probability,
    pick,
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return pick(entries)[0];
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = copy[i];
        const b = copy[j];
        if (a === undefined || b === undefined) continue;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    },
  };
}
