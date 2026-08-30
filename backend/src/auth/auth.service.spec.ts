import { ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HashService } from '../common/crypto/hash.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectMembershipDto } from './dto/select-membership.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const ENV_DEFAULTS: Record<string, string | number> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_SELECTION_SECRET: 'test-selection-secret',
  JWT_SELECTION_EXPIRES_IN: '5m',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MINUTES: 15,
  FRONTEND_URL: 'http://localhost:5173',
  PASSWORD_RESET_TOKEN_EXPIRES_MIN: 30,
};

function buildConfigServiceMock(): ConfigService {
  return {
    get: (key: string) => ENV_DEFAULTS[key],
    getOrThrow: (key: string) => {
      const value = ENV_DEFAULTS[key];
      if (value === undefined) throw new Error(`Missing env ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function buildJwtServiceMock() {
  return {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
}

describe('AuthService', () => {
  let hashService: HashService;
  let jwtService: ReturnType<typeof buildJwtServiceMock>;
  let configService: ConfigService;
  let emailService: EmailService;

  beforeEach(() => {
    hashService = new HashService();
    jwtService = buildJwtServiceMock();
    configService = buildConfigServiceMock();
    emailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;
  });

  describe('register (HU-01)', () => {
    let txMock: {
      company: { create: jest.Mock };
      user: { create: jest.Mock };
      membership: { create: jest.Mock };
    };
    let prismaMock: { user: { findUnique: jest.Mock }; $transaction: jest.Mock };
    let authService: AuthService;

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
          create: jest
            .fn()
            .mockResolvedValue({ id: 'user-1', email: dto.email, name: dto.name }),
        },
        membership: {
          create: jest.fn().mockResolvedValue({ id: 'membership-1', role: Role.ADMIN }),
        },
      };
      prismaMock = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
      };
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    it('crea User + Company + Membership(ADMIN) de forma atómica', async () => {
      const result = await authService.register(dto);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.membership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: Role.ADMIN }),
      });
      expect(result.membership.role).toBe(Role.ADMIN);
    });

    it('guarda la contraseña hasheada, nunca en texto plano', async () => {
      await authService.register(dto);
      const createArgs = txMock.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).not.toBe(dto.password);
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
      expect(await validate(dto)).toHaveLength(0);
    });

    it.each([
      ['corta', 'Dm1'],
      ['sin mayúscula', 'demo1234'],
      ['sin número', 'DemoDemo'],
    ])('rechaza una contraseña %s', async (_case, password) => {
      const dto = plainToInstance(RegisterDto, { ...base, password });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    });
  });

  describe('login (HU-02)', () => {
    let prismaMock: {
      user: { findUnique: jest.Mock; update: jest.Mock };
      membership: { findMany: jest.Mock };
      refreshToken: { create: jest.Mock };
    };
    let authService: AuthService;
    let storedHash: string;

    const dto: LoginDto = { email: 'admin@labendicion.com', password: 'Demo1234' };

    const activeMembership = {
      id: 'membership-1',
      role: Role.ADMIN,
      companyId: 'company-1',
      company: { id: 'company-1', name: 'La Bendición' },
    };

    beforeEach(async () => {
      storedHash = await hashService.hash('Demo1234');
      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: dto.email,
            name: 'Admin Demo',
            passwordHash: storedHash,
            failedLoginAttempts: 0,
            lockoutUntil: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        membership: {
          findMany: jest.fn().mockResolvedValue([activeMembership]),
        },
        refreshToken: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    it('emite accessToken + refreshToken cuando hay un solo membership activo', async () => {
      const result = await authService.login(dto);

      expect('needsMembershipSelection' in result).toBe(false);
      if ('accessToken' in result) {
        expect(result.accessToken).toBe('signed.jwt.token');
        expect(result.refreshToken).toHaveLength(64); // 32 bytes hex
        expect(result.membership.role).toBe(Role.ADMIN);
      }
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('devuelve selección de empresa cuando hay más de un membership activo', async () => {
      prismaMock.membership.findMany.mockResolvedValue([
        activeMembership,
        { ...activeMembership, id: 'membership-2', companyId: 'company-2', company: { id: 'company-2', name: 'Otra Empresa' } },
      ]);

      const result = await authService.login(dto);

      expect('needsMembershipSelection' in result).toBe(true);
      if ('needsMembershipSelection' in result) {
        expect(result.memberships).toHaveLength(2);
      }
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rechaza con mensaje genérico si el email no existe (sin revelar existencia)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const verifyDummySpy = jest.spyOn(hashService, 'verifyAgainstDummy');

      await expect(authService.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(verifyDummySpy).toHaveBeenCalledTimes(1);
    });

    it('incrementa failedLoginAttempts en un password incorrecto', async () => {
      await expect(
        authService.login({ ...dto, password: 'Incorrecta1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ failedLoginAttempts: 1 }),
      });
    });

    it('bloquea la cuenta 15 min tras el 5to intento fallido consecutivo (HU-02)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: 'Admin Demo',
        passwordHash: storedHash,
        failedLoginAttempts: 4, // este sería el 5to fallo
        lockoutUntil: null,
      });

      await expect(
        authService.login({ ...dto, password: 'Incorrecta1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          failedLoginAttempts: 0,
          lockoutUntil: expect.any(Date),
        }),
      });
    });

    it('rechaza el login mientras la cuenta está bloqueada, incluso con password correcto', async () => {
      const verifySpy = jest.spyOn(hashService, 'verify');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: 'Admin Demo',
        passwordHash: storedHash,
        failedLoginAttempts: 0,
        lockoutUntil: new Date(Date.now() + 10 * 60_000), // bloqueado 10 min más
      });

      await expect(authService.login(dto)).rejects.toThrow(HttpException);
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('resetea failedLoginAttempts y lockoutUntil tras un login exitoso', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: 'Admin Demo',
        passwordHash: storedHash,
        failedLoginAttempts: 3,
        lockoutUntil: null,
      });

      await authService.login(dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
    });

    it('rechaza si el usuario no tiene memberships activos', async () => {
      prismaMock.membership.findMany.mockResolvedValue([]);
      await expect(authService.login(dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('selectMembership (HU-02)', () => {
    let prismaMock: {
      membership: { findFirst: jest.Mock };
      user: { findUniqueOrThrow: jest.Mock };
      refreshToken: { create: jest.Mock };
    };
    let authService: AuthService;

    const dto: SelectMembershipDto = {
      selectionToken: 'valid.selection.token',
      membershipId: 'membership-2',
    };

    beforeEach(() => {
      prismaMock = {
        membership: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'membership-2',
            role: Role.OPERADOR,
            companyId: 'company-2',
            company: { id: 'company-2', name: 'Otra Empresa' },
          }),
        },
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'admin@labendicion.com',
            name: 'Admin Demo',
          }),
        },
        refreshToken: { create: jest.fn().mockResolvedValue({}) },
      };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-1',
        purpose: 'membership-select',
      });
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    it('emite tokens cuando el selectionToken y el membership son válidos', async () => {
      const result = await authService.selectMembership(dto);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prismaMock.membership.findFirst).toHaveBeenCalledWith({
        where: { id: dto.membershipId, userId: 'user-1', activo: true },
        include: { company: true },
      });
    });

    it('rechaza si el membership ya no está activo (no confía en la lista previa)', async () => {
      prismaMock.membership.findFirst.mockResolvedValue(null);
      await expect(authService.selectMembership(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza un selectionToken con propósito incorrecto', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-1',
        purpose: 'access',
      });
      await expect(authService.selectMembership(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza un selectionToken inválido/expirado', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('expired'));
      await expect(authService.selectMembership(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh / logout (HU-03)', () => {
    let prismaMock: {
      refreshToken: {
        findUnique: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        create: jest.Mock;
      };
    };
    let authService: AuthService;

    const activeMembership = {
      id: 'membership-1',
      role: Role.ADMIN,
      activo: true,
      companyId: 'company-1',
      company: { id: 'company-1', name: 'La Bendición' },
    };
    const user = { id: 'user-1', email: 'admin@labendicion.com', name: 'Admin Demo' };

    const validTokenRow = {
      id: 'refresh-1',
      userId: 'user-1',
      revokedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
      membership: activeMembership,
    };

    beforeEach(() => {
      prismaMock = {
        refreshToken: {
          findUnique: jest.fn().mockResolvedValue({ ...validTokenRow }),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    it('rota el refresh token: revoca el usado y emite uno nuevo', async () => {
      const result = await authService.refresh('raw-refresh-token');

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'refresh-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toHaveLength(64);
    });

    it('rechaza si no se envía cookie de refresh', async () => {
      await expect(authService.refresh(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si el token no existe en DB', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);
      await expect(authService.refresh('token-desconocido')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si el token está expirado', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...validTokenRow,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(authService.refresh('raw-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si el membership asociado ya no está activo', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...validTokenRow,
        membership: { ...activeMembership, activo: false },
      });
      await expect(authService.refresh('raw-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('reuse detection: un token ya revocado revoca TODAS las sesiones del usuario', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...validTokenRow,
        revokedAt: new Date(),
      });

      await expect(authService.refresh('raw-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('logout revoca solo el refresh token actual', async () => {
      await authService.logout('raw-refresh-token');
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokeAllSessionsForUser excluye la sesión actual cuando se indica', async () => {
      await authService.revokeAllSessionsForUser('user-1', 'raw-refresh-token');
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          tokenHash: { not: expect.any(String) },
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('forgotPassword / resetPassword (HU-04)', () => {
    let prismaMock: {
      user: { findUnique: jest.Mock; update: jest.Mock };
      passwordResetToken: {
        count: jest.Mock;
        create: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
      refreshToken: { updateMany: jest.Mock };
    };
    let authService: AuthService;

    const user = { id: 'user-1', email: 'admin@labendicion.com' };

    beforeEach(() => {
      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue(user),
          update: jest.fn().mockResolvedValue({}),
        },
        passwordResetToken: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    describe('forgotPassword', () => {
      const dto: ForgotPasswordDto = { email: 'admin@labendicion.com' };

      it('crea un token y envía el email cuando el usuario existe', async () => {
        const result = await authService.forgotPassword(dto);

        expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
        expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
          user.email,
          expect.stringContaining('/reset-password?token='),
        );
        expect(result.message).toMatch(/recibirás un link/);
      });

      it('devuelve el mismo mensaje genérico aunque el email no exista (sin revelar existencia)', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        const result = await authService.forgotPassword(dto);

        expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        expect(result.message).toMatch(/recibirás un link/);
      });

      it('no crea un 4to token dentro de la ventana de 15 min (rate limit 3/15min)', async () => {
        prismaMock.passwordResetToken.count.mockResolvedValue(3);

        const result = await authService.forgotPassword(dto);

        expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        // Mismo mensaje genérico — no delata que se alcanzó el límite.
        expect(result.message).toMatch(/recibirás un link/);
      });
    });

    describe('resetPassword', () => {
      const dto: ResetPasswordDto = { token: 'raw-reset-token', newPassword: 'Nueva1234' };

      const validTokenRow = {
        id: 'reset-token-1',
        userId: 'user-1',
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      };

      it('actualiza la contraseña, marca el token usado y revoca todas las sesiones', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue(validTokenRow);

        await authService.resetPassword(dto);

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { userId: 'user-1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
      });

      it('rechaza un token que no existe', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
        await expect(authService.resetPassword(dto)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rechaza un token ya usado', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          ...validTokenRow,
          usedAt: new Date(),
        });
        await expect(authService.resetPassword(dto)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rechaza un token expirado', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          ...validTokenRow,
          expiresAt: new Date(Date.now() - 1000),
        });
        await expect(authService.resetPassword(dto)).rejects.toThrow(
          UnauthorizedException,
        );
      });
    });
  });

  describe('changePassword (HU-05)', () => {
    let prismaMock: {
      user: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
      refreshToken: { updateMany: jest.Mock };
    };
    let authService: AuthService;
    let storedHash: string;

    const dto: ChangePasswordDto = {
      currentPassword: 'Demo1234',
      newPassword: 'NuevaClave1',
    };

    beforeEach(async () => {
      storedHash = await hashService.hash('Demo1234');
      prismaMock = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            passwordHash: storedHash,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        hashService,
        jwtService,
        configService,
        emailService,
      );
    });

    it('actualiza la contraseña cuando la actual es correcta', async () => {
      const result = await authService.changePassword('user-1', dto, 'current-refresh');

      const updateArgs = prismaMock.user.update.mock.calls[0][0];
      expect(updateArgs.data.passwordHash).not.toBe(dto.newPassword);
      expect(result.message).toMatch(/actualizada/);
    });

    it('rechaza el cambio si la contraseña actual es incorrecta', async () => {
      await expect(
        authService.changePassword(
          'user-1',
          { ...dto, currentPassword: 'Incorrecta1' },
          'current-refresh',
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('revoca todas las demás sesiones, excepto la sesión actual', async () => {
      await authService.changePassword('user-1', dto, 'current-refresh');

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          tokenHash: { not: expect.any(String) },
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('ChangePasswordDto validation (HU-05)', () => {
    it('rechaza una nueva contraseña débil (misma validación que HU-01)', async () => {
      const invalidDto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'Demo1234',
        newPassword: 'debil',
      });
      expect((await validate(invalidDto)).length).toBeGreaterThan(0);
    });
  });
});
