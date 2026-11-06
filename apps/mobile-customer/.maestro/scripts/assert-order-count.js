// Fails the flow unless the customer has exactly MORE orders more than when remember-order-count.js ran. USER_ID defaults to Alice, user-customer-1.
var user = typeof USER_ID === 'undefined' ? 'user-customer-1' : USER_ID;
var response = http.get('http://127.0.0.1:4199/order-count?user=' + user, { headers: { 'x-flow-control': '1' } });
if (!response.ok) {
  throw new Error('could not count the orders of ' + user + ': ' + response.status + ' ' + response.body);
}
var now = json(response.body).count;
var expected = output.ordersBefore + Number(MORE);
if (now !== expected) {
  throw new Error(
    user +
      ' has ' +
      now +
      ' orders; ' +
      expected +
      ' were expected (' +
      output.ordersBefore +
      ' before, ' +
      MORE +
      ' more)',
  );
}
