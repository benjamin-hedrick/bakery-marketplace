// Fails the flow unless Alice's newest order carries exactly the allergens in EXPECT (comma-separated ids; leave it out for none): what the bakery was told.
var response = http.get('http://127.0.0.1:4199/last-order', { headers: { 'x-flow-control': '1' } });
if (!response.ok) {
  throw new Error('could not read the newest order: ' + response.status + ' ' + response.body);
}
var order = json(response.body);
var expected = typeof EXPECT === 'undefined' || EXPECT === '' ? [] : EXPECT.split(',');
var actual = order.allergens.slice().sort();
expected.sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('the order carries allergens [' + actual + '] but [' + expected + '] were expected');
}
