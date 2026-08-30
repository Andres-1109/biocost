import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

function buildService(encryptionKeyHex: string): EncryptionService {
  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'ENCRYPTION_KEY') return encryptionKeyHex;
      throw new Error(`Unexpected key ${key}`);
    },
  } as unknown as ConfigService;

  const service = new EncryptionService(configService);
  service.onModuleInit();
  return service;
}

describe('EncryptionService', () => {
  const validKey = randomBytes(32).toString('hex');

  it('descifra correctamente lo que cifró (round-trip)', () => {
    const service = buildService(validKey);
    const plain = 'NIT-900123456-7';

    const encrypted = service.encrypt(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(':')).toHaveLength(3);

    expect(service.decrypt(encrypted)).toBe(plain);
  });

  it('produce un cifrado distinto cada vez para el mismo texto (IV aleatorio)', () => {
    const service = buildService(validKey);
    const a = service.encrypt('mismo-texto');
    const b = service.encrypt('mismo-texto');
    expect(a).not.toBe(b);
  });

  it('falla al arrancar si ENCRYPTION_KEY no mide 32 bytes', () => {
    expect(() => buildService('deadbeef')).toThrow();
  });

  it('falla al descifrar un payload manipulado (auth tag inválido)', () => {
    const service = buildService(validKey);
    const encrypted = service.encrypt('dato-sensible');
    const [iv, authTag, cipherText] = encrypted.split(':');
    const tampered = `${iv}:${authTag}:${cipherText.slice(0, -2)}ff`;

    expect(() => service.decrypt(tampered)).toThrow();
  });
});
