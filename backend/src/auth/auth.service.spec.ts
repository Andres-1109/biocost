import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HashService } from '../common/crypto/hash.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

describe('AuthService.register (HU-01)', () => {
  let authService: AuthService;
  let hashService: HashService;
  let txMock: {
    company: { create: jest.Mock };
    user: { create: jest.Mock };
    membership: { create: jest.Mock };
  };
  let prismaMock: {
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const dto: RegisterDto = {
    email: 'admin@labendicion.com',
    name: 'Admin Demo',
    password: 'Demo1234',
    companyName: 'La Bendición',
  };

  beforeEach(() => {
    txMock = {
      company: {
        create: jest.fn().mockResolvedValue({ id: 'company-1', name: dto.companyName }),
      },
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: dto.email,
          name: dto.name,
        }),
      },
      membership: {
        create: jest.fn().mockResolvedValue({
          id: 'membership-1',
          role: Role.ADMIN,
        }),
      },
    };

    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(txMock),
      ),
    };

    hashService = new HashService();
    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      hashService,
    );
  });

  it('crea User + Company + Membership(ADMIN) de forma atómica', async () => {
    const result = await authService.register(dto);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.company.create).toHaveBeenCalledWith({
      data: { name: dto.companyName },
    });
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: dto.email, name: dto.name }),
      }),
    );
    expect(txMock.membership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        companyId: 'company-1',
        role: Role.ADMIN,
      }),
    });

    expect(result.membership.role).toBe(Role.ADMIN);
    expect(result.user.email).toBe(dto.email);
  });

  it('guarda la contraseña hasheada, nunca en texto plano', async () => {
    await authService.register(dto);

    const createArgs = txMock.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe(dto.password);
    expect(createArgs.data.passwordHash.length).toBeGreaterThan(0);
  });

  it('rechaza el registro si el email ya existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(authService.register(dto)).rejects.toThrow(ConflictException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('RegisterDto validation (HU-01)', () => {
  const base = {
    email: 'admin@labendicion.com',
    name: 'Admin Demo',
    companyName: 'La Bendición',
  };

  it('acepta una contraseña fuerte (min 8, mayúscula, número)', async () => {
    const dto = plainToInstance(RegisterDto, { ...base, password: 'Demo1234' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['corta', 'Dm1'],
    ['sin mayúscula', 'demo1234'],
    ['sin número', 'DemoDemo'],
  ])('rechaza una contraseña %s', async (_case, password) => {
    const dto = plainToInstance(RegisterDto, { ...base, password });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
