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

// Contraseña temporal para operadores creados por un Admin (HU-06) que ya
// cumple la regla de fortaleza (min 8, 1 mayúscula, 1 número) sin depender
// de que el generador aleatorio la produzca por azar.
export function generateTemporaryPassword(): string {
  const randomPart = randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10);
  return `Bio${randomPart}1`;
}
