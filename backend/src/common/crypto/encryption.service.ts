import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM
const KEY_LENGTH = 32; // AES-256

// Cifrado simétrico reversible (HU-31) para campos que se deben leer de
// vuelta (ej. Company.nitEncrypted) — complementa a HashService, que cubre
// los datos que nunca deben poder revertirse (contraseñas).
// Formato de almacenamiento: "iv:authTag:cipherText", todo en hex.
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const hexKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY debe tener ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} caracteres hex), tiene ${key.length}.`,
      );
    }
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de payload cifrado inválido.');
    }
    const [ivHex, authTagHex, cipherTextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const cipherText = Buffer.from(cipherTextHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
