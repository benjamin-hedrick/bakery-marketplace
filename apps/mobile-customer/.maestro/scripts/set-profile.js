// Saves Alice's allergen profile through the BFF (via scripts/lib/flow-control.mjs, started by scripts/dev/mobile-flows.mjs).
// ALLERGIES and AVOID are comma-separated allergen ids ("tree-nut,dairy"); leaving both out clears the profile.
var list = function (value) {
  return typeof value === 'undefined' || value === '' ? [] : value.split(',');
};
var response = http.post('http://127.0.0.1:4199/profile', {
  headers: { 'content-type': 'application/json', 'x-flow-control': '1' },
  body: JSON.stringify({
    allergies: list(typeof ALLERGIES === 'undefined' ? undefined : ALLERGIES),
    avoid: list(typeof AVOID === 'undefined' ? undefined : AVOID),
  }),
});
if (!response.ok) {
  throw new Error('could not set the profile (is this run started by scripts/dev/mobile-flows.mjs?): ' + response.status + ' ' + response.body);
}
