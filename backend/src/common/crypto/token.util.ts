import { createHash, randomBytes } from 'crypto';

const TOKEN_BYTES = 32;

// Genera un token opaco de alta entropía (refresh tokens, reset tokens) y su
// hash para persistir en DB — nunca se guarda el valor crudo (HU-03, HU-04).
export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
