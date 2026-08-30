import { ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HashService } from '../common/crypto/hash.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectMembershipDto } from './dto/select-membership.dto';

const ENV_DEFAULTS: Record<string, string | number> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_SELECTION_SECRET: 'test-selection-secret',
  JWT_SELECTION_EXPIRES_IN: '5m',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MINUTES: 15,
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

  beforeEach(() => {
    hashService = new HashService();
    jwtService = buildJwtServiceMock();
    configService = buildConfigServiceMock();
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
});
