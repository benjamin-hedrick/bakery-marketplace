import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dietCartText, dietListText, dietOptionWarnings, type DietNote } from '../../src/lib/dietText.ts';

// WI-TAG-004: a diet is the bakery's claim. The wording says what the bakery has marked, never that an item is suitable, safe or free of anything, and "not marked"
// is never worded as "not vegan".

const note = (over: Partial<DietNote> = {}): DietNote => ({
  tagId: 'vegan',
  label: 'Vegan',
  marked: true,
  itemMarked: true,
  optionNames: [],
  ...over,
});

describe('dietListText', () => {
  test('a marked listing shows the bakery’s claim', () => {
    assert.equal(dietListText(note()), 'Vegan, marked by the bakery');
  });

  test('an unmarked listing says only that the bakery has not marked it', () => {
    assert.equal(dietListText(note({ marked: false, itemMarked: false })), 'Not marked vegan by the bakery');
  });

  test('no wording says an item is, or is not, suitable', () => {
    for (const n of [note(), note({ marked: false, itemMarked: false })])
      assert.doesNotMatch(dietListText(n), /\b(safe|suitable|free|is not vegan|isn't vegan|not vegan\b(?! by))/i);
  });
});

describe('dietOptionWarnings', () => {
  test('an option that would remove the claim is named, with what it does', () => {
    assert.deepEqual(dietOptionWarnings(note({ optionNames: ['Honey'] })), [
      "Honey is not marked vegan, so adding it removes the bakery's vegan claim",
    ]);
  });

  test('nothing is said when the item makes no claim, or when no option removes it', () => {
    assert.deepEqual(dietOptionWarnings(note({ marked: false, itemMarked: false, optionNames: ['Honey'] })), []);
    assert.deepEqual(dietOptionWarnings(note()), []);
  });
});

describe('dietCartText', () => {
  test('a marked line has nothing to say', () => {
    assert.equal(dietCartText('Country Sourdough', note()), null);
  });

  test('a line whose item is not marked says so', () => {
    assert.equal(
      dietCartText('Oat Milk Latte', note({ marked: false, itemMarked: false })),
      'Oat Milk Latte is not marked vegan by the bakery',
    );
  });

  test('a line whose item is marked but whose chosen options are not names them', () => {
    assert.equal(
      dietCartText('Country Sourdough', note({ marked: false, optionNames: ['Sliced', 'Honey'] })),
      'Country Sourdough with Sliced and Honey is not marked vegan by the bakery',
    );
  });
});
