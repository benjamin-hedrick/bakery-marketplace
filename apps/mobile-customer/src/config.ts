// Where the app finds the local stack. The emulator reaches the host's services through adb reverse (ADR-0023), so these are the same
// addresses the services expect as the issuer (iss): http://localhost:5100.
export const ISSUER = 'http://localhost:5100';
export const BFF_URL = 'http://localhost:4100/graphql';
export const CLIENT_ID = 'bakery-mobile'; // a public client: no secret (ADR-0023)
export const REDIRECT_URI = 'com.bakerymarketplace.mobile:/auth/callback';
export const SCOPE = 'openid offline_access';
