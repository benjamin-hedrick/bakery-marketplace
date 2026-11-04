// Fails the flow unless a customer's newest order carries exactly the allergens in EXPECT (comma-separated ids; leave it out for none): what the bakery was told.
// USER_ID is the customer's id (a seeded customer of the mock identity, for example user-customer-treenut); it defaults to Alice, user-customer-1.
var user = typeof USER_ID === 'undefined' ? 'user-customer-1' : USER_ID;
var response = http.get('http://127.0.0.1:4199/last-order?user=' + user, { headers: { 'x-flow-control': '1' } });
if (!response.ok) {
  throw new Error('could not read the newest order of ' + user + ': ' + response.status + ' ' + response.body);
}
var order = json(response.body);
var expected = typeof EXPECT === 'undefined' || EXPECT === '' ? [] : EXPECT.split(',');
var actual = order.allergens.slice().sort();
expected.sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('the order of ' + user + ' carries allergens [' + actual + '] but [' + expected + '] were expected');
}
