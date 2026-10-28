// Relay global IDs (first-slice contract D-9): base64 of `Type:serviceId`, produced and decoded only in the BFF.
// Decoding is strict: anything that is not canonical base64 of `Type:serviceId` is "not an id", never an error.

export function toGlobalId(type: string, serviceId: string): string {
  return Buffer.from(`${type}:${serviceId}`, 'utf8').toString('base64');
}

export function fromGlobalId(globalId: string): { type: string; serviceId: string } | null {
  const bytes = Buffer.from(globalId, 'base64');
  if (bytes.toString('base64') !== globalId) return null;
  const text = bytes.toString('utf8');
  const colon = text.indexOf(':');
  if (colon < 1 || colon === text.length - 1) return null;
  return { type: text.slice(0, colon), serviceId: text.slice(colon + 1) };
}

export function serviceIdFor(type: string, globalId: string): string | null {
  const decoded = fromGlobalId(globalId);
  return decoded?.type === type ? decoded.serviceId : null;
}
