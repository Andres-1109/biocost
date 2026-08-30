import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { generateTemporaryPassword } from '../common/crypto/token.util';
import { HashService } from '../common/crypto/hash.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperatorDto } from './dto/create-operator.dto';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
    private readonly emailService: EmailService,
  ) {}

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

  // HU-06: el admin crea un operador para su empresa. Si el email ya existe
  // como User (en otra empresa), solo se crea el nuevo Membership — el
  // usuario conserva sus credenciales originales, no se toca su password.
  async createOperator(adminCompanyId: string, dto: CreateOperatorDto) {
    const existingUser = await this.findByEmail(dto.email);

    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          userId_companyId: { userId: existingUser.id, companyId: adminCompanyId },
        },
      });
      if (existingMembership) {
        throw new ConflictException('Este usuario ya tiene acceso a esta empresa.');
      }

      const membership = await this.prisma.membership.create({
        data: { userId: existingUser.id, companyId: adminCompanyId, role: Role.OPERADOR },
      });

      return {
        user: { id: existingUser.id, email: existingUser.email, name: existingUser.name },
        membership: { id: membership.id, role: membership.role },
        temporaryPasswordSent: false,
      };
    }

    const isPasswordProvidedByAdmin = !!dto.password;
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await this.hashService.hash(password);

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, companyId: adminCompanyId, role: Role.OPERADOR },
      });
      return { user, membership };
    });

    if (!isPasswordProvidedByAdmin) {
      await this.emailService.sendTemporaryPasswordEmail(user.email, password);
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      membership: { id: membership.id, role: membership.role },
      temporaryPasswordSent: !isPasswordProvidedByAdmin,
    };
  }

  // HU-07: lista los memberships de la empresa del admin, para que pueda
  // gestionarlos (desactivar, HU-08 toggle de dashboard).
  async listMemberships(companyId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      activo: m.activo,
      puedeVerDashboard: m.puedeVerDashboard,
      user: m.user,
    }));
  }

  // HU-07: soft delete de un Membership OPERADOR — nunca se borra
  // físicamente, para conservar "Registrado por: [nombre]" en el historial
  // de transacciones. Solo opera sobre role=OPERADOR (no permite desactivar
  // a otro ADMIN por esta vía) y está scoped a la company del admin (404 si
  // el membership no le pertenece, para no confirmar su existencia).
  async deactivateOperator(adminCompanyId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, companyId: adminCompanyId },
    });

    if (!membership) {
      throw new NotFoundException('Membership no encontrado.');
    }

    if (membership.role !== Role.OPERADOR) {
      throw new BadRequestException('Solo se pueden desactivar operadores.');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { activo: false, deletedAt: new Date() },
    });

    // Cierra únicamente las sesiones ligadas a ESTE membership — si el
    // usuario tiene acceso activo a otra empresa, esas sesiones no se tocan.
    await this.prisma.refreshToken.updateMany({
      where: { membershipId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return {
      id: updated.id,
      activo: updated.activo,
      deletedAt: updated.deletedAt,
    };
  }
}
