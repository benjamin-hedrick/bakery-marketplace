import type { NextApiRequest, NextApiResponse } from 'next';
import { authSettingsFromEnv } from '../../lib/auth/config';

// Run-time configuration the browser needs and the build must not contain (ADR-0020, register item 101): where to log in. Public values only.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const result = authSettingsFromEnv(process.env);
  if (!result.ok) {
    // The reason names a setting, never a value, and goes to the server log, not to the browser.
    console.error(JSON.stringify({ level: 'error', msg: 'login settings are not usable', reason: result.reason }));
    res.status(503).json({ error: 'Login is not configured' });
    return;
  }
  res.status(200).json(result.settings);
}
