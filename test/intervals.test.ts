import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Recitation Part 2 (groups) and problem set Task 2.
// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Valid intervals by construction: end = start + a non-negative span.
// No .filter and no fc.pre. Random pairs can be start > end, which the
// specification rejects.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -40, max: 40 }), fc.integer({ min: 0, max: 25 }))
  .map(([start, span]): Interval => [start, start + span]);

// Builds a list that is guaranteed to contain a gap, a shared endpoint, or an
// overlap, then shuffles it. Random intervals almost never share an endpoint,
// so a generator that only picks them is flaky on touch bugs.
const sequenced: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer({ min: -15, max: 15 }),
    fc.integer({ min: 0, max: 12 }),
    fc.array(
      fc.record({
        kind: fc.constantFrom('gap' as const, 'touch' as const, 'overlap' as const),
        span: fc.integer({ min: 0, max: 12 }),
        amount: fc.integer({ min: 1, max: 8 }),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  )
  .chain(([origin, firstSpan, steps]) => {
    const built: Interval[] = [[origin, origin + firstSpan]];
    for (const step of steps) {
      const [prevStart, prevEnd] = built[built.length - 1];
      let start: number;
      if (step.kind === 'gap') {
        start = prevEnd + step.amount;
      } else if (step.kind === 'touch') {
        start = prevEnd;
      } else {
        const room = prevEnd - prevStart;
        start = room === 0 ? prevEnd : prevEnd - Math.min(step.amount, room);
      }
      built.push([start, start + step.span]);
    }
    return fc.shuffledSubarray(built, { minLength: built.length, maxLength: built.length });
  });

const intervalList: fc.Arbitrary<Interval[]> = fc.oneof(
  { arbitrary: fc.constant<Interval[]>([]), weight: 1 },
  { arbitrary: fc.array(interval, { minLength: 1, maxLength: 8 }), weight: 2 },
  { arbitrary: sequenced, weight: 3 },
);

// Targeted generator for the conditional property. Each next start is at
// least one past the previous end, so the intervals neither overlap nor touch.
const disjointInput: fc.Arbitrary<{ input: Interval[]; sorted: Interval[] }> = fc
  .tuple(
    fc.integer({ min: -20, max: 20 }),
    fc.array(
      fc.record({
        span: fc.integer({ min: 0, max: 10 }),
        gap: fc.integer({ min: 1, max: 6 }),
      }),
      { minLength: 0, maxLength: 6 },
    ),
  )
  .chain(([origin, parts]) => {
    const sorted: Interval[] = [];
    let start = origin;
    for (const part of parts) {
      const end = start + part.span;
      sorted.push([start, end]);
      start = end + part.gap;
    }
    if (sorted.length === 0) return fc.constant({ input: [] as Interval[], sorted });
    const copies = sorted.map(([s, e]): Interval => [s, e]);
    return fc
      .shuffledSubarray(copies, { minLength: copies.length, maxLength: copies.length })
      .map(input => ({ input, sorted }));
  });

const reversedInterval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: 1, max: 15 }))
  .map(([end, extra]): Interval => [end + extra, end]);

const fractionalInterval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -10, max: 10 }), fc.integer({ min: 0, max: 8 }))
  .map(([start, span]): Interval => [start + 0.5, start + span + 0.5]);

/** Tiny oracle: is the real number `point` inside any closed interval? */
function covers(intervals: readonly Interval[], point: number): boolean {
  return intervals.some(([start, end]) => start <= point && point <= end);
}

/** Endpoints, half-steps just outside them, and midpoints. Enough to tell integer closed intervals apart. */
function pointsToCheck(groups: readonly (readonly Interval[])[]): number[] {
  const all = groups.flat();
  if (all.length === 0) return [-0.5, 0, 0.5];
  const points = new Set<number>();
  for (const [start, end] of all) {
    points.add(start);
    points.add(end);
    points.add(start - 0.5);
    points.add(end + 0.5);
    points.add((start + end) / 2);
  }
  return [...points];
}

describe('mergeIntervals', () => {
  // Pattern: invariant. The output is sorted, and consecutive intervals neither overlap nor touch.
  it('returns sorted, non-overlapping, non-touching intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let i = 0; i < out.length; i++) {
          expect(Number.isInteger(out[i][0])).toBe(true);
          expect(Number.isInteger(out[i][1])).toBe(true);
          expect(out[i][0]).toBeLessThanOrEqual(out[i][1]);
          if (i + 1 < out.length) expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The input array and the intervals in it are not modified.
  it('does not modify the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const snapshot = xs.map(([start, end]): Interval => [start, end]);
        mergeIntervals(xs);
        expect(xs).toEqual(snapshot);
      }),
    );
  });

  // Pattern: differential. A point is covered by the output exactly when the input covers it.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const point of pointsToCheck([xs, out])) {
          expect(covers(out, point)).toBe(covers(xs, point));
        }
      }),
    );
  });

  // Pattern: metamorphic. Reordering the input does not change the merged intervals.
  it('is unchanged by reordering the input', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs => {
          if (xs.length === 0) return fc.constant({ original: xs, shuffled: [] as Interval[] });
          return fc
            .shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })
            .map(shuffled => ({ original: xs, shuffled }));
        }),
        ({ original, shuffled }) => {
          expect(mergeIntervals(shuffled)).toEqual(mergeIntervals(original));
        },
      ),
    );
  });

  // Pattern: metamorphic. Shifting every endpoint by the same amount shifts the merge by that amount.
  it('shifts with its input', () => {
    fc.assert(
      fc.property(intervalList, fc.integer({ min: -20, max: 20 }), (xs, delta) => {
        const shifted = xs.map(([start, end]): Interval => [start + delta, end + delta]);
        const expected = mergeIntervals(xs).map(([start, end]): Interval => [start + delta, end + delta]);
        expect(mergeIntervals(shifted)).toEqual(expected);
      }),
    );
  });

  // Pattern: algebraic. Merging an already merged list changes nothing.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Targeted generator: intervals are placed so each previous end is strictly
  // less than the next start. They are shuffled afterwards.
  // Pattern: conditional. Already-disjoint input is returned unchanged except for order.
  it('returns already-disjoint input unchanged except for order', () => {
    fc.assert(
      fc.property(disjointInput, ({ input, sorted }) => {
        expect(mergeIntervals(input)).toEqual(sorted);
      }),
    );
  });

  // Pattern: conditional. An interval with start after end, or a non-integer endpoint, is rejected.
  it('rejects intervals that break the preconditions', () => {
    const invalid = fc.oneof(reversedInterval, fractionalInterval);
    fc.assert(
      fc.property(invalid, fc.array(interval, { maxLength: 3 }), (bad, rest) => {
        expect(() => mergeIntervals([bad, ...rest])).toThrow(RangeError);
      }),
    );
  });
});
