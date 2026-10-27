# Reflection

**Name / Andrew ID:** Dominic (dominicGGG)

**Recitation group members (Task 2):** Completed individually. No recitation group was recorded.

---

### 1. Valid but weak

`returns exactly five colors` passes on the correct `matchGuess` and did not kill any public mutant. It is still valid: the specification says the function returns five colors, one per position of the guess. It would catch a bug that drops the last position and returns four colors, for example `matchGuess('APPLE', 'ALLEY')` returning `['G', 'Y', 'B', 'Y']`.

### 2. A generator problem, not a property problem

`ignoresCounts` and `singlePass` survived the scoring properties when every word was five *distinct* letters. The credit property is right — a letter must not be colored G or Y more times than the secret contains it — but that generator never repeats a letter, so a guess cannot ask for more copies than the secret has. Both mutants only mis-count repeated letters.

Before, with `distinctWord` as the only word generator (scoring properties only):

```
  ✘ ignoresCounts  SURVIVED
  ✘ singlePass     SURVIVED

Mutation score: 3/5 killed (60%)
```

The fix is to also draw words from `ABC`. Five letters from a 3-letter alphabet must repeat. After that, the same credit property kills both:

```
  ✔ ignoresCounts  killed  by: never credits a letter more times than the secret contains it; assigns yellows left to right without reusing a secret letter; rejects words that are not five uppercase letters
      Counterexample: ["ACAAA","CAACA"]
      AssertionError: expected 2 to be less than or equal to 1
  ✔ singlePass     killed  by: never credits a letter more times than the secret contains it; assigns yellows left to right without reusing a secret letter; rejects words that are not five uppercase letters
      Counterexample: ["AAAAB","AAABB"]
      AssertionError: expected 2 to be less than or equal to 1

Mutation score: 5/5 killed (100%)
```

`CAACA` uses `A` three times against `ACAAA`, which has four `A`s and one `C`. The second `C` in the guess is an extra credit. The distinct-letter generator could not produce that. A small alphabet hides the opposite bug, so the generator also builds 5 distinct letters and full-alphabet words.

### 3. Reading a counterexample

From `npm run mutants:intervals`, mutant `touchingNotMerged`:

```
  ✔ touchingNotMerged       killed  by: returns sorted, non-overlapping, non-touching intervals; is unchanged by reordering the input; rejects intervals that break the preconditions
      Counterexample: [[[0,0],[0,0]]]
      AssertionError: expected 0 to be less than 0
```

The specification says consecutive output intervals neither overlap nor touch: `result[i][1] < result[i + 1][0]`. Two copies of `[0, 0]` touch at 0, the same situation as `[1, 3]` and `[3, 5]` merging at a shared endpoint. The output still had two intervals meeting at 0, so `0 < 0` failed. Those two blocks have to become one `[0, 0]`.

### 4. Your project

`summarizeAgainstPeers` in the team OpenCode project (`packages/opencode/src/student/peer-performance.ts`) compares one student's performance note with classmates on the same assignment.

- **Invariant.** `peerCount` equals the number of notes with the same assignment and a different student, and both averages are null exactly when that count is 0. A note for another assignment, or a second note from the same student, must not move the averages.
- **Metamorphic.** Shuffling the peer list does not change `peerCount`, the rounded averages, or the set of shared stuck points.

The generator should build notes directly: an assignment id, a student id, a question count, a quality, and a few stuck-point strings, then a list that mixes same-assignment peers, other-assignment notes, and a copy of the subject student. A naive generator draws those fields independently, so it almost never reuses an assignment id, almost never repeats the subject student (those notes must be ignored), and almost never matches a stuck point only after the function's trim-and-lowercase step (`" Off by one "` versus `"off by one"`). Averages are rounded to one decimal, so the oracle has to round the same way.
