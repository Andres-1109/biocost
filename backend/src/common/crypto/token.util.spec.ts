import { generateOpaqueToken, hashToken } from './token.util';

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
});
