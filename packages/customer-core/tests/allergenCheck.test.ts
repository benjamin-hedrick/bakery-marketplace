import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cartCheckLines, lineConflictsFromCheck, profileFromPreferences } from '../src/allergenCheck.ts';
import type { ConflictView } from '../src/conflictText.ts';

const nut: ConflictView = { allergenId: 'tree-nut', severity: 'ALLERGY', source: 'ITEM', optionIds: [] };
const dairy: ConflictView = { allergenId: 'dairy', severity: 'AVOID', source: 'ITEM', optionIds: [] };
const almonds: ConflictView = {
  allergenId: 'tree-nut',
  severity: 'ALLERGY',
  source: 'OPTION',
  optionIds: ['opt-almonds'],
};

describe('profileFromPreferences', () => {
  test('is null when the customer saved nothing, so the screens say there is no profile instead of "no conflicts"', () => {
    assert.equal(profileFromPreferences({ allergies: [], avoid: [], prefer: [] }), null);
    assert.equal(profileFromPreferences(null), null);
    assert.equal(profileFromPreferences(undefined), null);
  });

  test('is the profile when any of the three lists has something', () => {
    assert.deepEqual(profileFromPreferences({ allergies: ['tree-nut'], avoid: [], prefer: [] }), {
      allergies: ['tree-nut'],
      avoid: [],
      prefer: [],
    });
    assert.notEqual(profileFromPreferences({ allergies: [], avoid: ['dairy'], prefer: [] }), null);
    assert.notEqual(profileFromPreferences({ allergies: [], avoid: [], prefer: ['vegan'] }), null);
  });
});

describe('lineConflictsFromCheck', () => {
  test('gives each conflict the position of its line in the answer, in the order asked', () => {
    const answer = [{ conflicts: [nut, dairy] }, { conflicts: [] }, { conflicts: [almonds] }];
    assert.deepEqual(lineConflictsFromCheck(answer), [
      { lineIndex: 0, conflict: nut },
      { lineIndex: 0, conflict: dairy },
      { lineIndex: 2, conflict: almonds },
    ]);
  });

  test('is empty when nothing conflicts or nothing was asked', () => {
    assert.deepEqual(lineConflictsFromCheck([{ conflicts: [] }, { conflicts: [] }]), []);
    assert.deepEqual(lineConflictsFromCheck([]), []);
  });
});

describe('cartCheckLines', () => {
  test('asks about the listing and the raw ids of the chosen options, in cart order, and sends nothing else', () => {
    const lines = [
      { listingId: 'L1', modifiers: [{ id: 'a' }, { id: 'b' }], quantity: 3, name: 'x' },
      { listingId: 'L2', modifiers: [], quantity: 1, name: 'y' },
    ];
    assert.deepEqual(cartCheckLines(lines), [
      { listingId: 'L1', optionIds: ['a', 'b'] },
      { listingId: 'L2', optionIds: [] },
    ]);
  });
});
