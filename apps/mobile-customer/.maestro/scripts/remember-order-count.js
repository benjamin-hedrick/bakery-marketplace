// Remembers how many orders a customer has now (output.ordersBefore), so a later step can assert how many were added. USER_ID defaults to Alice, user-customer-1.
var user = typeof USER_ID === 'undefined' ? 'user-customer-1' : USER_ID;
var response = http.get('http://127.0.0.1:4199/order-count?user=' + user, { headers: { 'x-flow-control': '1' } });
if (!response.ok) {
  throw new Error('could not count the orders of ' + user + ': ' + response.status + ' ' + response.body);
}
output.ordersBefore = json(response.body).count;
