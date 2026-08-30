import { HashService } from './hash.service';

describe('HashService', () => {
  let service: HashService;

  beforeEach(() => {
    service = new HashService();
  });

  it('genera un hash distinto del texto plano', async () => {
    const hash = await service.hash('Password1');
    expect(hash).not.toBe('Password1');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('verifica correctamente una contraseña correcta', async () => {
    const hash = await service.hash('Password1');
    await expect(service.verify('Password1', hash)).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await service.hash('Password1');
    await expect(service.verify('OtraPassword1', hash)).resolves.toBe(false);
  });

  it('genera hashes distintos para la misma contraseña (salt aleatorio)', async () => {
    const hashA = await service.hash('Password1');
    const hashB = await service.hash('Password1');
    expect(hashA).not.toBe(hashB);
  });
});
