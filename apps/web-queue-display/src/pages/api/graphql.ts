import type { NextApiRequest, NextApiResponse } from 'next';
import { extraForwardedHeaders, proxyGraphql } from '../../lib/graphql-proxy';

// The body is read by the proxy itself and sent on unchanged.
export const config = { api: { bodyParser: false } };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Read on every request, not at build time: the same image runs in every environment.
  return proxyGraphql(
    req,
    res,
    process.env['GRAPHQL_URL'],
    extraForwardedHeaders(process.env['GRAPHQL_EXTRA_FORWARDED_HEADERS']),
  );
}
