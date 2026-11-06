// Restarts the mock issuer (the runner restarts its container and waits until it answers). The issuer keeps its refresh tokens in memory, so it forgets every one,
// and it signs with a new key afterwards: run this in the last flow of a run only.
var response = http.post('http://127.0.0.1:4199/issuer/restart', {
  headers: { 'content-type': 'application/json', 'x-flow-control': '1' },
  body: '{}',
});
if (!response.ok) {
  throw new Error('could not restart the issuer: ' + response.status + ' ' + response.body);
}
