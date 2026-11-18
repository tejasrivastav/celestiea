// mulberry32: tiny, fast and good enough for synthetic data. A fixed seed makes every
// seed run produce byte-identical CSVs.
export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1));
  }

  function pick<T>(values: readonly T[]): T {
    return values[Math.floor(next() * values.length)] as T;
  }

  function weighted<T>(options: readonly (readonly [T, number])[]): T {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [value, weight] of options) {
      roll -= weight;
      if (roll < 0) {
        return value;
      }
    }
    return options[options.length - 1]![0];
  }

  function chance(probability: number): boolean {
    return next() < probability;
  }

  function normal(): number {
    return Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  }

  return { next, int, pick, weighted, chance, normal };
}

export type Random = ReturnType<typeof createRandom>;
