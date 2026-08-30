import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(
    email: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<User | null> {
    return client.user.findUnique({ where: { email } });
  }

  async create(
    data: { email: string; name: string; passwordHash: string },
    client: PrismaClientOrTx = this.prisma,
  ): Promise<User> {
    return client.user.create({ data });
  }

  // HU-03: el admin puede revocar las sesiones activas de un usuario de su
  // propia empresa (ej. sospecha de acceso indebido). Scoping estricto por
  // companyId del admin — nunca por lo que venga en la URL/body — y 404 (no
  // 403) si el usuario no pertenece a esa empresa, para no confirmar su
  // existencia a otro tenant (IDOR).
  async revokeSessions(adminCompanyId: string, targetUserId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: targetUserId, companyId: adminCompanyId, activo: true },
    });

    if (!membership) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { revokedSessions: result.count };
  }
}
