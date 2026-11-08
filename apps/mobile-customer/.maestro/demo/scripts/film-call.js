// Calls the demo film director (scripts/dev/film/film.mjs): CALL is a path with a query, for example /pause?ms=3000, /beat?name=phone-ordered or /wait?name=go-phone.
// FILM_URL comes from the director (maestro test -e FILM_URL=...). The director answers a pause or a wait when it is over, so this call can take seconds.
var response = http.get(FILM_URL + CALL);
if (!response.ok) {
  throw new Error('the film director did not accept ' + CALL + ': ' + response.status + ' ' + response.body);
}
