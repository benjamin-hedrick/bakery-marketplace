// Brings the BFF back (the runner starts its process again and waits until it answers). Safe to run when it is already up.
var response = http.post('http://127.0.0.1:4199/bff/start', { headers: { 'content-type': 'application/json', 'x-flow-control': '1' }, body: '{}' });
if (!response.ok) {
  throw new Error('could not start the BFF: ' + response.status + ' ' + response.body);
}
