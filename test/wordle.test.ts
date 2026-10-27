import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchGuess } from '../src/wordle';

// Recitation Part 1: follow along with your TA, filling in the todos below.
// Problem set Task 1: keep adding properties until `npm run mutants:wordle`
// kills every mutant. Read the spec in src/wordle/matchGuess.ts.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The result always has exactly five colors.
// (invariant, algebraic, metamorphic, differential, or conditional)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const letterFrom = (alphabet: string): fc.Arbitrary<string> => fc.constantFrom(...alphabet.split(''));

const wordFrom = (alphabet: string): fc.Arbitrary<string> =>
  fc.array(letterFrom(alphabet), { minLength: 5, maxLength: 5 }).map(chars => chars.join(''));

// Five distinct letters. A 3-letter alphabet cannot build this case, and that
// hides bugs that only show up when no letter repeats.
const distinctWord: fc.Arbitrary<string> = fc
  .shuffledSubarray([...ALPHABET], { minLength: 5, maxLength: 5 })
  .map(chars => chars.join(''));

// Small alphabets make repeated letters common (duplicate-count bugs).
// Distinct words and the full alphabet make absent letters and one-of-each
// letters common (bugs a small alphabet hides).
// Small alphabets make repeated letters common (duplicate-count bugs).
// Distinct words and the full alphabet make absent letters and one-of-each
// letters common (bugs a small alphabet hides).
const word = fc.oneof(
  { arbitrary: wordFrom('ABC'), weight: 3 },
  { arbitrary: distinctWord, weight: 2 },
  { arbitrary: wordFrom(ALPHABET), weight: 1 },
);

const countLetter = (text: string, letter: string): number => [...text].filter(char => char === letter).length;

describe('matchGuess', () => {
  // Pattern: invariant. The result always has exactly five colors.
  it('returns exactly five colors', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        expect(matchGuess(secret, guess)).toHaveLength(5);
      }),
    );
  });

  // Pattern: invariant. Every color is G, Y, or B.
  it('only uses the colors G, Y, B', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        for (const color of matchGuess(secret, guess)) {
          expect(color === 'G' || color === 'Y' || color === 'B').toBe(true);
        }
      }),
    );
  });

  // Targeted generator: the guess is the secret, not a random word that
  // happened to match.
  // Pattern: conditional. Guessing the secret gives all greens.
  it('guessing the secret gives all greens', () => {
    fc.assert(
      fc.property(word, secret => {
        expect(matchGuess(secret, secret)).toEqual(['G', 'G', 'G', 'G', 'G']);
      }),
    );
  });

  // Pattern: invariant. Greens and yellows for a letter never exceed how many times the secret contains it.
  it('never credits a letter more times than the secret contains it', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const colors = matchGuess(secret, guess);
        const letters = new Set([...secret, ...guess]);
        for (const letter of letters) {
          const credited = colors.filter(
            (color, index) => (color === 'G' || color === 'Y') && guess[index] === letter,
          ).length;
          expect(credited).toBeLessThanOrEqual(countLetter(secret, letter));
        }
      }),
    );
  });

  // Pattern: differential. Green is exactly the obvious per-position equality check.
  it('marks a position green exactly when the letters match', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const colors = matchGuess(secret, guess);
        for (let i = 0; i < 5; i++) {
          expect(colors[i] === 'G').toBe(secret[i] === guess[i]);
        }
      }),
    );
  });

  // Pattern: invariant. Yellows are the leftmost non-green uses of each letter, up to the letters the secret has left.
  it('assigns yellows left to right without reusing a secret letter', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const colors = matchGuess(secret, guess);
        const letters = new Set([...secret, ...guess]);
        for (const letter of letters) {
          const greens = countLetter(
            [...secret].filter((char, index) => char === letter && guess[index] === letter).join(''),
            letter,
          );
          const remaining = countLetter(secret, letter) - greens;
          const candidates: number[] = [];
          for (let i = 0; i < 5; i++) {
            if (guess[i] === letter && secret[i] !== letter) candidates.push(i);
          }
          const expectedYellows = candidates.slice(0, Math.max(0, remaining));
          const actualYellows: number[] = [];
          for (let i = 0; i < 5; i++) {
            if (guess[i] === letter && colors[i] === 'Y') actualYellows.push(i);
          }
          expect(actualYellows).toEqual(expectedYellows);
        }
      }),
    );
  });

  // Targeted generator: secret is drawn from ABC and guess from XYZ, so the
  // words are built with no letter in common.
  // Pattern: conditional. A guess that shares no letters with the secret is all black.
  it('a guess with no letters in common is all black', () => {
    fc.assert(
      fc.property(wordFrom('ABC'), wordFrom('XYZ'), (secret, guess) => {
        expect(matchGuess(secret, guess)).toEqual(['B', 'B', 'B', 'B', 'B']);
      }),
    );
  });

  // Pattern: metamorphic. Relabeling both words with the same letter permutation leaves the colors unchanged.
  it('a shared letter relabeling leaves the colors unchanged', () => {
    fc.assert(
      fc.property(
        word,
        word,
        fc.shuffledSubarray([...ALPHABET], { minLength: ALPHABET.length, maxLength: ALPHABET.length }),
        (secret, guess, permutation) => {
          const relabelOf: Record<string, string> = {};
          [...ALPHABET].forEach((char, index) => {
            relabelOf[char] = permutation[index];
          });
          const relabel = (text: string) => [...text].map(char => relabelOf[char]).join('');
          expect(matchGuess(relabel(secret), relabel(guess))).toEqual(matchGuess(secret, guess));
        },
      ),
    );
  });

  // Pattern: conditional. A word that is not five uppercase letters is rejected.
  it('rejects words that are not five uppercase letters', () => {
    const notAWord = fc.oneof(
      fc.constant(''),
      fc.constant('ABCD'),
      fc.constant('ABCDEF'),
      fc.constant('abcde'),
      fc.constant('AB CD'),
      fc.constant('12345'),
      wordFrom('abc'),
    );
    fc.assert(
      fc.property(notAWord, word, (secret, guess) => {
        expect(() => matchGuess(secret, guess)).toThrow(RangeError);
      }),
    );
    fc.assert(
      fc.property(word, notAWord, (secret, guess) => {
        expect(() => matchGuess(secret, guess)).toThrow(RangeError);
      }),
    );
  });
});
