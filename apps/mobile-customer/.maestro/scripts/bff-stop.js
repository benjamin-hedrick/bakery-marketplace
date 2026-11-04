// Takes the BFF away (the runner stops its process and waits until it no longer answers).
var response = http.post('http://127.0.0.1:4199/bff/stop', { headers: { 'content-type': 'application/json', 'x-flow-control': '1' }, body: '{}' });
if (!response.ok) {
  throw new Error('could not stop the BFF: ' + response.status + ' ' + response.body);
}
