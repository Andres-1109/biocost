import { NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

function buildEncryptionService(): EncryptionService {
  const configService = {
    getOrThrow: () => randomBytes(32).toString('hex'),
  } as unknown as ConfigService;
  const service = new EncryptionService(configService);
  service.onModuleInit();
  return service;
}

describe('CompaniesService (HU-09)', () => {
  let prismaMock: { company: { findUnique: jest.Mock; update: jest.Mock } };
  let encryptionService: EncryptionService;
  let companiesService: CompaniesService;

  const baseCompany = {
    id: 'company-1',
    name: 'La Bendición',
    nitEncrypted: null as string | null,
    address: null as string | null,
    phone: null as string | null,
    logoUrl: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    encryptionService = buildEncryptionService();
    prismaMock = {
      company: {
        findUnique: jest.fn().mockResolvedValue(baseCompany),
        update: jest.fn(),
      },
    };
    companiesService = new CompaniesService(
      prismaMock as unknown as PrismaService,
      encryptionService,
    );
  });

  it('findById descifra el NIT antes de devolverlo', async () => {
    const encryptedNit = encryptionService.encrypt('900123456-7');
    prismaMock.company.findUnique.mockResolvedValue({
      ...baseCompany,
      nitEncrypted: encryptedNit,
    });

    const result = await companiesService.findById('company-1');

    expect(result.nit).toBe('900123456-7');
  });

  it('findById devuelve nit null cuando no hay NIT guardado', async () => {
    const result = await companiesService.findById('company-1');
    expect(result.nit).toBeNull();
  });

  it('findById lanza 404 si la empresa no existe', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);
    await expect(companiesService.findById('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update cifra el NIT antes de persistirlo', async () => {
    prismaMock.company.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...baseCompany, ...data }),
    );

    await companiesService.update('company-1', { nit: '900123456-7' });

    const updateArgs = prismaMock.company.update.mock.calls[0][0];
    expect(updateArgs.data.nitEncrypted).not.toBe('900123456-7');
    expect(encryptionService.decrypt(updateArgs.data.nitEncrypted)).toBe(
      '900123456-7',
    );
  });

  it('update limpia el NIT cuando se envía string vacío', async () => {
    prismaMock.company.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...baseCompany, ...data }),
    );

    await companiesService.update('company-1', { nit: '' });

    expect(prismaMock.company.update.mock.calls[0][0].data.nitEncrypted).toBeNull();
  });

  it('update solo toca los campos presentes en el DTO (parcial)', async () => {
    prismaMock.company.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...baseCompany, ...data }),
    );

    await companiesService.update('company-1', { address: 'Tasajera, Magdalena' });

    const updateArgs = prismaMock.company.update.mock.calls[0][0];
    expect(updateArgs.data).toEqual({ address: 'Tasajera, Magdalena' });
  });
});
