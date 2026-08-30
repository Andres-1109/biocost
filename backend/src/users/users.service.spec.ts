import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { HashService } from '../common/crypto/hash.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UsersService } from './users.service';

function buildEmailServiceMock(): EmailService {
  return {
    sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;
}

describe('UsersService.revokeSessions (HU-03)', () => {
  let prismaMock: {
    membership: { findFirst: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
  };
  let usersService: UsersService;

  beforeEach(() => {
    prismaMock = {
      membership: { findFirst: jest.fn() },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    usersService = new UsersService(
      prismaMock as unknown as PrismaService,
      new HashService(),
      buildEmailServiceMock(),
    );
  });

  it('revoca las sesiones cuando el usuario pertenece a la company del admin', async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ id: 'membership-2' });

    const result = await usersService.revokeSessions('company-1', 'user-2');

    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-2', companyId: 'company-1', activo: true },
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.revokedSessions).toBe(2);
  });

  it('rechaza con 404 (no 403) si el usuario no pertenece a la company del admin — evita IDOR', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);

    await expect(
      usersService.revokeSessions('company-1', 'user-de-otra-empresa'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('UsersService.createOperator (HU-06)', () => {
  let prismaMock: {
    user: { findUnique: jest.Mock };
    membership: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: ReturnType<typeof buildEmailServiceMock>;
  let usersService: UsersService;

  const adminCompanyId = 'company-1';
  const dto: CreateOperatorDto = {
    email: 'operador@labendicion.com',
    name: 'Operador Demo',
  };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'membership-new', role: Role.OPERADOR }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-new',
              email: dto.email,
              name: dto.name,
            }),
          },
          membership: prismaMock.membership,
        }),
      ),
    };
    emailService = buildEmailServiceMock();
    usersService = new UsersService(
      prismaMock as unknown as PrismaService,
      new HashService(),
      emailService,
    );
  });

  it('crea User + Membership(OPERADOR) y envía password temporal cuando el email no existe', async () => {
    const result = await usersService.createOperator(adminCompanyId, dto);

    expect(result.membership.role).toBe(Role.OPERADOR);
    expect(result.temporaryPasswordSent).toBe(true);
    expect(emailService.sendTemporaryPasswordEmail).toHaveBeenCalledWith(
      dto.email,
      expect.any(String),
    );
  });

  it('usa la contraseña provista por el admin sin enviar email cuando se especifica', async () => {
    const result = await usersService.createOperator(adminCompanyId, {
      ...dto,
      password: 'Provista1234',
    });

    expect(result.temporaryPasswordSent).toBe(false);
    expect(emailService.sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it('si el email ya existe como User, solo crea el Membership (conserva credenciales)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-existing',
      email: dto.email,
      name: 'Ya Existe',
      passwordHash: 'hash-original',
    });

    const result = await usersService.createOperator(adminCompanyId, dto);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.membership.create).toHaveBeenCalledWith({
      data: { userId: 'user-existing', companyId: adminCompanyId, role: Role.OPERADOR },
    });
    expect(result.temporaryPasswordSent).toBe(false);
    expect(emailService.sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it('rechaza si el usuario existente ya tiene membership en esta empresa', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-existing' });
    prismaMock.membership.findUnique.mockResolvedValue({ id: 'membership-existing' });

    await expect(usersService.createOperator(adminCompanyId, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });
});

describe('UsersService.deactivateOperator (HU-07)', () => {
  let prismaMock: {
    membership: { findFirst: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
  };
  let usersService: UsersService;

  const adminCompanyId = 'company-1';

  beforeEach(() => {
    prismaMock = {
      membership: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 'membership-op',
          activo: false,
          deletedAt: new Date(),
        }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    usersService = new UsersService(
      prismaMock as unknown as PrismaService,
      new HashService(),
      buildEmailServiceMock(),
    );
  });

  it('desactiva un membership OPERADOR y revoca sus sesiones', async () => {
    prismaMock.membership.findFirst.mockResolvedValue({
      id: 'membership-op',
      role: Role.OPERADOR,
      companyId: adminCompanyId,
    });

    const result = await usersService.deactivateOperator(adminCompanyId, 'membership-op');

    expect(prismaMock.membership.update).toHaveBeenCalledWith({
      where: { id: 'membership-op' },
      data: { activo: false, deletedAt: expect.any(Date) },
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { membershipId: 'membership-op', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.activo).toBe(false);
  });

  it('rechaza con 404 si el membership no pertenece a la company del admin — evita IDOR', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);

    await expect(
      usersService.deactivateOperator(adminCompanyId, 'membership-de-otra-empresa'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
  });

  it('rechaza desactivar un membership ADMIN por esta vía', async () => {
    prismaMock.membership.findFirst.mockResolvedValue({
      id: 'membership-admin',
      role: Role.ADMIN,
      companyId: adminCompanyId,
    });

    await expect(
      usersService.deactivateOperator(adminCompanyId, 'membership-admin'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
  });
});
