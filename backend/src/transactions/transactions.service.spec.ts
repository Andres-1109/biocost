import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InsumoCategoriaPadre, Role, TransaccionCategoria, TransaccionTipo } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CreateIngresoDto } from './dto/create-ingreso.dto';
import { TransactionsService } from './transactions.service';

function buildAuditServiceMock(): AuditService {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

describe('TransactionsService.createEgreso (HU-14)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock };
    transaction: { create: jest.Mock };
  };
  let insumosServiceMock: { findActiveOwnedOrThrow: jest.Mock };
  let transactionsService: TransactionsService;

  const currentUser: RequestUser = {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    role: Role.OPERADOR,
  };

  const baseDto = {
    categoria: TransaccionCategoria.MANO_DE_OBRA,
    monto: 500_000,
    fecha: '2026-04-15',
    cycleId: 'cycle-1',
  };

  beforeEach(() => {
    prismaMock = {
      cycle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO' }),
      },
      transaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    };
    insumosServiceMock = { findActiveOwnedOrThrow: jest.fn() };
    transactionsService = new TransactionsService(
      prismaMock as unknown as PrismaService,
      insumosServiceMock as unknown as InsumosService,
      buildAuditServiceMock(),
    );
  });

  it('crea un egreso sin insumo cuando la categoría no lo requiere', async () => {
    await transactionsService.createEgreso(currentUser, baseDto);

    expect(prismaMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'EGRESO',
        categoria: TransaccionCategoria.MANO_DE_OBRA,
        insumoId: undefined,
        createdByMembershipId: currentUser.membershipId,
        createdById: currentUser.userId,
      }),
    });
    expect(insumosServiceMock.findActiveOwnedOrThrow).not.toHaveBeenCalled();
  });

  it('rechaza si el ciclo no pertenece a la company o no existe', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(transactionsService.createEgreso(currentUser, baseDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza si el ciclo está CERRADO', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({ id: 'cycle-1', estado: 'CERRADO' });
    await expect(transactionsService.createEgreso(currentUser, baseDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('exige insumoId cuando la categoría es ALIMENTO_CONCENTRADO', async () => {
    await expect(
      transactionsService.createEgreso(currentUser, {
        ...baseDto,
        categoria: TransaccionCategoria.ALIMENTO_CONCENTRADO,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('acepta un insumoId válido y consistente con la categoría', async () => {
    insumosServiceMock.findActiveOwnedOrThrow.mockResolvedValue({
      id: 'insumo-1',
      categoriaPadre: InsumoCategoriaPadre.ALIMENTO,
    });

    await transactionsService.createEgreso(currentUser, {
      ...baseDto,
      categoria: TransaccionCategoria.ALIMENTO_CONCENTRADO,
      insumoId: 'insumo-1',
    });

    expect(insumosServiceMock.findActiveOwnedOrThrow).toHaveBeenCalledWith('company-1', 'insumo-1');
    expect(prismaMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ insumoId: 'insumo-1' }),
    });
  });

  it('rechaza un insumo cuya categoriaPadre no coincide (ej. QUIMICO para un egreso de Alimento)', async () => {
    insumosServiceMock.findActiveOwnedOrThrow.mockResolvedValue({
      id: 'insumo-1',
      categoriaPadre: InsumoCategoriaPadre.QUIMICO,
    });

    await expect(
      transactionsService.createEgreso(currentUser, {
        ...baseDto,
        categoria: TransaccionCategoria.ALIMENTO_CONCENTRADO,
        insumoId: 'insumo-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza un insumoId si la categoría no lo admite', async () => {
    await expect(
      transactionsService.createEgreso(currentUser, { ...baseDto, insumoId: 'insumo-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });
});

describe('TransactionsService.createIngreso (HU-15)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock };
    transaction: { create: jest.Mock };
  };
  let transactionsService: TransactionsService;

  const currentUser: RequestUser = {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    role: Role.OPERADOR,
  };

  const ingresoDto = {
    categoria: TransaccionCategoria.VENTA_PESCADO,
    monto: 5_000_000,
    fecha: '2026-05-01',
    cycleId: 'cycle-1',
  };

  beforeEach(() => {
    prismaMock = {
      cycle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO' }),
      },
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
    };
    transactionsService = new TransactionsService(
      prismaMock as unknown as PrismaService,
      {} as unknown as InsumosService,
      buildAuditServiceMock(),
    );
  });

  it('crea un ingreso válido', async () => {
    await transactionsService.createIngreso(currentUser, ingresoDto);
    expect(prismaMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'INGRESO',
        categoria: TransaccionCategoria.VENTA_PESCADO,
        createdByMembershipId: currentUser.membershipId,
      }),
    });
  });

  it('rechaza sobre un ciclo cerrado', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({ id: 'cycle-1', estado: 'CERRADO' });
    await expect(transactionsService.createIngreso(currentUser, ingresoDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza sobre un ciclo que no pertenece a la company', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(transactionsService.createIngreso(currentUser, ingresoDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });
});

describe('CreateIngresoDto validation (HU-15)', () => {
  const base = { monto: 1000, fecha: '2026-05-01', cycleId: '11111111-1111-4111-8111-111111111111' };

  it('acepta una categoría de ingreso válida', async () => {
    const dto = plainToInstance(CreateIngresoDto, {
      ...base,
      categoria: TransaccionCategoria.VENTA_PESCADO,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza una categoría de egreso (ej. MANO_DE_OBRA) en el endpoint de ingresos', async () => {
    const dto = plainToInstance(CreateIngresoDto, {
      ...base,
      categoria: TransaccionCategoria.MANO_DE_OBRA,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('TransactionsService.update / remove (HU-17)', () => {
  let prismaMock: {
    transaction: { findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };
  let insumosServiceMock: { findActiveOwnedOrThrow: jest.Mock };
  let auditServiceMock: { record: jest.Mock };
  let transactionsService: TransactionsService;

  const currentUser: RequestUser = {
    userId: 'user-admin',
    membershipId: 'membership-admin',
    companyId: 'company-1',
    role: Role.ADMIN,
  };

  const existingTx = {
    id: 'tx-1',
    tipo: 'EGRESO',
    categoria: TransaccionCategoria.MANO_DE_OBRA,
    monto: { toString: () => '500000' },
    fecha: new Date('2026-04-10'),
    cantidad: null,
    unidadMedida: null,
    descripcion: 'Original',
    facturaUrl: null,
    insumoId: null,
    cycle: { estado: 'ACTIVO' },
  };

  beforeEach(() => {
    prismaMock = {
      transaction: {
        findFirst: jest.fn().mockResolvedValue(existingTx),
        update: jest.fn().mockResolvedValue({ ...existingTx, descripcion: 'Corregido' }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    insumosServiceMock = { findActiveOwnedOrThrow: jest.fn() };
    auditServiceMock = { record: jest.fn().mockResolvedValue(undefined) };
    transactionsService = new TransactionsService(
      prismaMock as unknown as PrismaService,
      insumosServiceMock as unknown as InsumosService,
      auditServiceMock as unknown as AuditService,
    );
  });

  it('edita la transacción y registra la auditoría con valores antes/después', async () => {
    await transactionsService.update(currentUser, 'tx-1', { descripcion: 'Corregido' });

    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({ descripcion: 'Corregido', updatedById: 'user-admin' }),
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EDITAR',
        entidad: 'TRANSACCION',
        entidadId: 'tx-1',
        valoresAntes: expect.objectContaining({ descripcion: 'Original' }),
        valoresDespues: expect.objectContaining({ descripcion: 'Corregido' }),
      }),
    );
  });

  it('elimina la transacción y registra la auditoría', async () => {
    await transactionsService.remove(currentUser, 'tx-1');

    expect(prismaMock.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ELIMINAR',
        entidad: 'TRANSACCION',
        entidadId: 'tx-1',
        valoresAntes: expect.objectContaining({ descripcion: 'Original' }),
      }),
    );
  });

  it('rechaza con 404 si la transacción no pertenece a la company', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);
    await expect(
      transactionsService.update(currentUser, 'tx-de-otra-empresa', { descripcion: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
  });

  it('rechaza editar con 409 si el ciclo de la transacción está CERRADO', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ ...existingTx, cycle: { estado: 'CERRADO' } });
    await expect(
      transactionsService.update(currentUser, 'tx-1', { descripcion: 'X' }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
  });

  it('rechaza eliminar con 409 si el ciclo de la transacción está CERRADO', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ ...existingTx, cycle: { estado: 'CERRADO' } });
    await expect(transactionsService.remove(currentUser, 'tx-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
  });

  it('rechaza asignar una categoría de ingreso a una transacción de tipo EGRESO', async () => {
    await expect(
      transactionsService.update(currentUser, 'tx-1', {
        categoria: TransaccionCategoria.VENTA_PESCADO,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
  });

  it('valida el insumo si se cambia la categoría a una que lo requiere', async () => {
    insumosServiceMock.findActiveOwnedOrThrow.mockResolvedValue({
      id: 'insumo-1',
      categoriaPadre: InsumoCategoriaPadre.ALIMENTO,
    });

    await transactionsService.update(currentUser, 'tx-1', {
      categoria: TransaccionCategoria.ALIMENTO_CONCENTRADO,
      insumoId: 'insumo-1',
    });

    expect(insumosServiceMock.findActiveOwnedOrThrow).toHaveBeenCalledWith('company-1', 'insumo-1');
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({ insumoId: 'insumo-1' }),
    });
  });
});

describe('TransactionsService.findAll (HU-18)', () => {
  let prismaMock: {
    transaction: { findMany: jest.Mock; count: jest.Mock };
    membership: { findUnique: jest.Mock };
  };
  let transactionsService: TransactionsService;

  const txRow = {
    id: 'tx-1',
    createdByMembership: { user: { name: 'Operador Demo' } },
  };

  beforeEach(() => {
    prismaMock = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([txRow]),
        count: jest.fn().mockResolvedValue(1),
      },
      membership: { findUnique: jest.fn() },
    };
    transactionsService = new TransactionsService(
      prismaMock as unknown as PrismaService,
      {} as unknown as InsumosService,
      buildAuditServiceMock(),
    );
  });

  it('un Admin ve el consolidado de la empresa (sin filtrar por membership)', async () => {
    const admin: RequestUser = {
      userId: 'user-admin',
      membershipId: 'membership-admin',
      companyId: 'company-1',
      role: Role.ADMIN,
    };

    await transactionsService.findAll(admin, { page: 1, pageSize: 20 });

    const callArgs = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(callArgs.where.createdByMembershipId).toBeUndefined();
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });

  it('un Operador SIN puedeVerDashboard solo ve su propio historial', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ puedeVerDashboard: false });
    const operador: RequestUser = {
      userId: 'user-op',
      membershipId: 'membership-op',
      companyId: 'company-1',
      role: Role.OPERADOR,
    };

    await transactionsService.findAll(operador, { page: 1, pageSize: 20 });

    const callArgs = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(callArgs.where.createdByMembershipId).toBe('membership-op');
  });

  it('un Operador CON puedeVerDashboard ve el consolidado', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ puedeVerDashboard: true });
    const operador: RequestUser = {
      userId: 'user-op',
      membershipId: 'membership-op',
      companyId: 'company-1',
      role: Role.OPERADOR,
    };

    await transactionsService.findAll(operador, { page: 1, pageSize: 20 });

    const callArgs = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(callArgs.where.createdByMembershipId).toBeUndefined();
  });

  it('re-consulta el Membership en cada request (no confía en el JWT)', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ puedeVerDashboard: false });
    const operador: RequestUser = {
      userId: 'user-op',
      membershipId: 'membership-op',
      companyId: 'company-1',
      role: Role.OPERADOR,
    };

    await transactionsService.findAll(operador, { page: 1, pageSize: 20 });

    expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
      where: { id: 'membership-op' },
      select: { puedeVerDashboard: true },
    });
  });

  it('aplica filtros combinados (ciclo, categoría, tipo, rango de fechas)', async () => {
    const admin: RequestUser = {
      userId: 'user-admin',
      membershipId: 'membership-admin',
      companyId: 'company-1',
      role: Role.ADMIN,
    };

    await transactionsService.findAll(admin, {
      cycleId: 'cycle-1',
      categoria: TransaccionCategoria.VENTA_PESCADO,
      tipo: TransaccionTipo.INGRESO,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      page: 1,
      pageSize: 20,
    });

    const callArgs = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual(
      expect.objectContaining({
        cycleId: 'cycle-1',
        categoria: TransaccionCategoria.VENTA_PESCADO,
        tipo: TransaccionTipo.INGRESO,
        fecha: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
      }),
    );
  });

  it('pagina correctamente (skip/take) y devuelve total', async () => {
    const admin: RequestUser = {
      userId: 'user-admin',
      membershipId: 'membership-admin',
      companyId: 'company-1',
      role: Role.ADMIN,
    };

    const result = await transactionsService.findAll(admin, { page: 2, pageSize: 10 });

    const callArgs = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    expect(callArgs.take).toBe(10);
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.data[0].registradoPor).toBe('Operador Demo');
  });
});
