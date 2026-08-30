import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Hash de un solo sentido (HU-01, HU-31): contraseñas, nunca reversibles.
@Injectable()
export class HashService {
  // Hash fijo válido usado como comparación dummy cuando el sujeto (ej. email)
  // no existe, para que el tiempo de respuesta no delate su existencia.
  private readonly dummyHash = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async verifyAgainstDummy(): Promise<void> {
    await bcrypt.compare('irrelevant', this.dummyHash);
  }
}
