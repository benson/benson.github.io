// PKCE (RFC 7636, S256) + CSRF state, using only node:crypto.
import { randomBytes, createHash } from 'node:crypto';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

export function randomState() {
  return base64url(randomBytes(24));
}
