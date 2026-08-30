import { generateOpaqueToken, generateTemporaryPassword, hashToken } from './token.util';

describe('token.util', () => {
  it('genera tokens de alta entropía y distintos entre sí', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBe(64); // 32 bytes en hex
  });

  it('produce el mismo hash para el mismo token', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produce hashes distintos para tokens distintos', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(hashToken(a)).not.toBe(hashToken(b));
  });

  it('el hash no revela el token original', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).not.toBe(token);
  });

  it('generateTemporaryPassword produce una contraseña que cumple la regla de fortaleza (HU-06)', () => {
    const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    for (let i = 0; i < 20; i++) {
      expect(generateTemporaryPassword()).toMatch(STRONG_PASSWORD_REGEX);
    }
  });
});
