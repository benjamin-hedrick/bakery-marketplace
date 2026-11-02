import { apiRoutes } from '@bakery/web-session';

// The body is read by the proxy itself (and limited there), and the answer is relayed as it arrives: no body parser, and no size limit or
// warning for a response that is meant to stay open (ADR-0021).
export const config = { api: { bodyParser: false, responseLimit: false } };

// The browser's way to a subscription (ADR-0013, ADR-0019): the session's token is attached here, on the server, and the BFF's event stream is
// passed through. A stream ends when the token expires; the client asks again and gets a renewed one.
export default apiRoutes.graphqlStream;
