import { apiRoutes } from '@bakery/web-session';

// The body is read by the proxy itself and sent on unchanged.
export const config = { api: { bodyParser: false } };

// The browser's only way to the BFF (ADR-0013): the session's token is attached here, on the server (ADR-0019).
export default apiRoutes.graphql;
