import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptionKey } from './config.ts';

// Authenticated encryption of what the session store holds (ADR-0019): AES-256-GCM, a fresh 96-bit nonce per record, and the record's own id as
// associated data, so a record that is altered, or copied under another id, fails to open. Sealed form: `s1.<key id>.<nonce>.<ciphertext+tag>`.

export interface Sealer {
  seal(plaintext: string, associatedData: string): string;
  /** The plaintext, or null for anything that is not a record this sealer can open (wrong key, altered, wrong id, unknown key id). */
  open(sealed: string, associatedData: string): string | null;
}

const TAG_BYTES = 16;

export function createSealer(current: EncryptionKey, previous?: EncryptionKey): Sealer {
  const keys = new Map<string, Buffer>([[current.id, current.key]]);
  if (previous) keys.set(previous.id, previous.key);

  return {
    seal(plaintext, associatedData) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', current.key, nonce);
      cipher.setAAD(Buffer.from(associatedData, 'utf8'));
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return `s1.${current.id}.${nonce.toString('base64url')}.${body.toString('base64url')}`;
    },
    open(sealed, associatedData) {
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== 's1') return null;
      const key = keys.get(parts[1]!);
      if (!key) return null;
      try {
        const nonce = Buffer.from(parts[2]!, 'base64url');
        const body = Buffer.from(parts[3]!, 'base64url');
        if (nonce.length !== 12 || body.length < TAG_BYTES) return null;
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(Buffer.from(associatedData, 'utf8'));
        decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
        return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString(
          'utf8',
        );
      } catch {
        return null; // altered, wrong key, wrong associated data: indistinguishable on purpose
      }
    },
  };
}
