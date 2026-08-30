import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { generateOpaqueToken, hashToken } from '../common/crypto/token.util';
import { HashService } from '../common/crypto/hash.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelectMembershipDto } from './dto/select-membership.dto';
import { AccessTokenPayload } from './strategies/jwt-access.strategy';

interface SelectionTokenPayload {
  sub: string;
  purpose: 'membership-select';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // HU-01: crea User + Company + Membership(ADMIN) de forma atómica.
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado.');
    }

    const passwordHash = await this.hashService.hash(dto.password);

    const { user, company, membership } = await this.prisma.$transaction(
      async (tx) => {
        const company = await tx.company.create({
          data: { name: dto.companyName },
        });

        const user = await tx.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            passwordHash,
          },
        });

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            companyId: company.id,
            role: Role.ADMIN,
          },
        });

        return { user, company, membership };
      },
    );

    return {
      user: { id: user.id, email: user.email, name: user.name },
      company: { id: company.id, name: company.name },
      membership: { id: membership.id, role: membership.role },
    };
  }

  // HU-02: login con rate limiting (5 fallos → bloqueo 15 min) y selección
  // de empresa cuando el usuario tiene más de un Membership activo.
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Corremos una comparación dummy para que el tiempo de respuesta no
      // delate si el email existe o no (mitigación de timing attack).
      await this.hashService.verifyAgainstDummy();
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
      const remainingMs = user.lockoutUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60_000);
      throw new HttpException(
        `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta de nuevo en ${remainingMinutes} minuto(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordMatches = await this.hashService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, activo: true },
      include: { company: true },
    });

    if (memberships.length === 0) {
      throw new ForbiddenException('No tienes accesos activos en ninguna empresa.');
    }

    if (memberships.length === 1) {
      return this.issueSession(user, memberships[0]);
    }

    const selectionPayload: SelectionTokenPayload = {
      sub: user.id,
      purpose: 'membership-select',
    };
    const selectionToken = await this.jwtService.signAsync(selectionPayload, {
      secret: this.configService.getOrThrow<string>('JWT_SELECTION_SECRET'),
      expiresIn: this.configService.get<string>('JWT_SELECTION_EXPIRES_IN') ?? '5m',
    });

    return {
      needsMembershipSelection: true as const,
      selectionToken,
      memberships: memberships.map((m) => ({
        id: m.id,
        companyId: m.companyId,
        companyName: m.company.name,
        role: m.role,
      })),
    };
  }

  // HU-02: segundo paso del login cuando hay múltiples Membership activos.
  async selectMembership(dto: SelectMembershipDto) {
    let payload: SelectionTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<SelectionTokenPayload>(
        dto.selectionToken,
        { secret: this.configService.getOrThrow<string>('JWT_SELECTION_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Token de selección inválido o expirado.');
    }

    if (payload.purpose !== 'membership-select') {
      throw new UnauthorizedException('Token de selección inválido.');
    }

    // Se re-consulta en DB en vez de confiar en la lista devuelta por login():
    // el membership pudo haberse desactivado entre ambos pasos.
    const membership = await this.prisma.membership.findFirst({
      where: { id: dto.membershipId, userId: payload.sub, activo: true },
      include: { company: true },
    });

    if (!membership) {
      throw new UnauthorizedException('Membership inválido o inactivo.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });

    return this.issueSession(user, membership);
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number) {
    const maxAttempts = this.configService.get<number>('LOGIN_MAX_ATTEMPTS') ?? 5;
    const lockoutMinutes =
      this.configService.get<number>('LOGIN_LOCKOUT_MINUTES') ?? 15;

    const newAttempts = currentAttempts + 1;
    const shouldLock = newAttempts >= maxAttempts;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: shouldLock ? 0 : newAttempts,
        lockoutUntil: shouldLock
          ? new Date(Date.now() + lockoutMinutes * 60_000)
          : undefined,
      },
    });
  }

  private async issueSession(
    user: { id: string; email: string; name: string },
    membership: {
      id: string;
      role: Role;
      companyId: string;
      company: { id: string; name: string };
    },
  ) {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      membershipId: membership.id,
      companyId: membership.companyId,
      role: membership.role,
      purpose: 'access',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshTokenRaw = generateOpaqueToken();
    const refreshExpiresInDays = 7;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        membershipId: membership.id,
        tokenHash: hashToken(refreshTokenRaw),
        expiresAt: new Date(Date.now() + refreshExpiresInDays * 24 * 60 * 60_000),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: { id: user.id, email: user.email, name: user.name },
      company: { id: membership.company.id, name: membership.company.name },
      membership: { id: membership.id, role: membership.role },
    };
  }

  // HU-03: renueva el access token a partir de un refresh token válido.
  // Rotación: cada refresh revoca la fila usada y crea una nueva. Si el
  // tokenHash presentado ya está revocado, se trata como señal de robo
  // (reuse detection) y se cierran TODAS las sesiones del usuario.
  async refresh(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Sesión no encontrada.');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const tokenRow = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true, membership: { include: { company: true } } },
    });

    if (!tokenRow) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    if (tokenRow.revokedAt) {
      await this.revokeAllSessionsForUser(tokenRow.userId);
      throw new UnauthorizedException(
        'Sesión inválida. Por seguridad se cerraron todas tus sesiones activas.',
      );
    }

    if (tokenRow.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión expirada.');
    }

    if (!tokenRow.membership || !tokenRow.membership.activo) {
      throw new UnauthorizedException('Tu acceso a esta empresa ya no está activo.');
    }

    await this.prisma.refreshToken.update({
      where: { id: tokenRow.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(tokenRow.user, tokenRow.membership);
  }

  // HU-03: cierre de sesión explícito — revoca solo el refresh token actual.
  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // HU-03/HU-05: revoca todos los refresh tokens activos de un usuario,
  // excepto opcionalmente el de la sesión actual (HU-05: cambio de password).
  async revokeAllSessionsForUser(userId: string, exceptRawToken?: string) {
    const exceptHash = exceptRawToken ? hashToken(exceptRawToken) : undefined;
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
