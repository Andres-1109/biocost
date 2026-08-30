import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

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
    usersService = new UsersService(prismaMock as unknown as PrismaService);
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
