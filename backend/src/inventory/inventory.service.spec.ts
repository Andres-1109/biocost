import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryMovementTipo, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { InventoryService } from './inventory.service';

describe('InventoryService — núcleo compartido (HU-20/21/22)', () => {
  let clientMock: {
    inventory: { findUnique: jest.Mock; upsert: jest.Mock };
    inventoryMovement: { create: jest.Mock };
  };
  let inventoryService: InventoryService;

  beforeEach(() => {
    clientMock = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    inventoryService = new InventoryService(
      {} as unknown as PrismaService,
      {} as unknown as InsumosService,
      {} as unknown as AuditService,
    );
  });

  const baseParams = {
    farmId: 'farm-1',
    insumoId: 'insumo-1',
    membershipId: 'membership-1',
    userId: 'user-1',
    fecha: new Date('2026-04-10'),
  };

  it('parte de stock 0 cuando no existe fila de Inventory todavía', async () => {
    const movement = await inventoryService.applyMovement(
      { ...baseParams, tipo: InventoryMovementTipo.ENTRADA_COMPRA, delta: 50 },
      clientMock as never,
    );

    expect(movement.stockAntes).toBe(0);
    expect(movement.stockDespues).toBe(50);
    expect(clientMock.inventory.upsert).toHaveBeenCalledWith({
      where: { farmId_insumoId: { farmId: 'farm-1', insumoId: 'insumo-1' } },
      create: { farmId: 'farm-1', insumoId: 'insumo-1', stockActual: 50 },
      update: { stockActual: 50 },
    });
  });

  it('suma sobre el stock existente', async () => {
    clientMock.inventory.findUnique.mockResolvedValue({ stockActual: 100 });

    const movement = await inventoryService.applyMovement(
      { ...baseParams, tipo: InventoryMovementTipo.ENTRADA_COMPRA, delta: 30 },
      clientMock as never,
    );

    expect(movement.stockAntes).toBe(100);
    expect(movement.stockDespues).toBe(130);
  });

  it('resta correctamente con delta negativo (consumo/ajuste)', async () => {
    clientMock.inventory.findUnique.mockResolvedValue({ stockActual: 100 });

    const movement = await inventoryService.applyMovement(
      { ...baseParams, tipo: InventoryMovementTipo.SALIDA_CONSUMO, delta: -40 },
      clientMock as never,
    );

    expect(movement.stockAntes).toBe(100);
    expect(movement.stockDespues).toBe(60);
  });

  it('registerEntradaCompra delega en applyMovement con tipo ENTRADA_COMPRA y delta positivo', async () => {
    const movement = await inventoryService.registerEntradaCompra(
      { ...baseParams, cantidad: 25, transactionId: 'tx-1', cycleId: 'cycle-1' },
      clientMock as never,
    );

    expect(clientMock.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: InventoryMovementTipo.ENTRADA_COMPRA,
        cantidad: 25,
        transactionId: 'tx-1',
        cycleId: 'cycle-1',
      }),
    });
    expect(movement.stockDespues).toBe(25);
  });
});

describe('InventoryService.registerAjusteManual (HU-21)', () => {
  let prismaMock: {
    farm: { findFirst: jest.Mock };
    inventory: { findUnique: jest.Mock; upsert: jest.Mock };
    inventoryMovement: { create: jest.Mock };
  };
  let insumosServiceMock: { findActiveOwnedOrThrow: jest.Mock };
  let auditServiceMock: { record: jest.Mock };
  let inventoryService: InventoryService;

  const currentUser: RequestUser = {
    userId: 'user-admin',
    membershipId: 'membership-admin',
    companyId: 'company-1',
    role: Role.ADMIN,
  };

  const dto = {
    farmId: 'farm-1',
    insumoId: 'insumo-1',
    cantidad: -5,
    motivo: 'Merma por humedad',
    fecha: '2026-04-15',
  };

  beforeEach(() => {
    prismaMock = {
      farm: { findFirst: jest.fn().mockResolvedValue({ id: 'farm-1', companyId: 'company-1' }) },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ stockActual: 50 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'movement-1', ...data }),
        ),
      },
    };
    insumosServiceMock = {
      findActiveOwnedOrThrow: jest.fn().mockResolvedValue({ id: 'insumo-1' }),
    };
    auditServiceMock = { record: jest.fn().mockResolvedValue(undefined) };
    inventoryService = new InventoryService(
      prismaMock as unknown as PrismaService,
      insumosServiceMock as unknown as InsumosService,
      auditServiceMock as unknown as AuditService,
    );
  });

  it('aplica el ajuste (positivo o negativo) y lo registra en AuditLog', async () => {
    const movement = await inventoryService.registerAjusteManual(currentUser, dto);

    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: InventoryMovementTipo.AJUSTE_MANUAL,
        cantidad: -5,
        motivo: 'Merma por humedad',
      }),
    });
    expect(movement.stockDespues).toBe(45);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREAR',
        entidad: 'INVENTARIO',
        entidadId: 'movement-1',
        valoresDespues: expect.objectContaining({ motivo: 'Merma por humedad', cantidad: -5 }),
      }),
    );
  });

  it('acepta un ajuste positivo (sobrante de conteo físico)', async () => {
    const movement = await inventoryService.registerAjusteManual(currentUser, {
      ...dto,
      cantidad: 10,
      motivo: 'Conteo físico',
    });
    expect(movement.stockDespues).toBe(60);
  });

  it('rechaza con 404 si la finca no pertenece a la company', async () => {
    prismaMock.farm.findFirst.mockResolvedValue(null);
    await expect(inventoryService.registerAjusteManual(currentUser, dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('propaga el rechazo si el insumo no pertenece a la company o está inactivo', async () => {
    insumosServiceMock.findActiveOwnedOrThrow.mockRejectedValue(new Error('insumo inválido'));
    await expect(inventoryService.registerAjusteManual(currentUser, dto)).rejects.toThrow();
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe('InventoryService.registerConsumo (HU-22)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock };
    inventory: { findUnique: jest.Mock; upsert: jest.Mock };
    inventoryMovement: { create: jest.Mock };
  };
  let insumosServiceMock: { findActiveOwnedOrThrow: jest.Mock };
  let inventoryService: InventoryService;

  const currentUser: RequestUser = {
    userId: 'user-op',
    membershipId: 'membership-op',
    companyId: 'company-1',
    role: Role.OPERADOR,
  };

  const dto = {
    insumoId: 'insumo-1',
    cycleId: 'cycle-1',
    cantidad: 20,
    fecha: '2026-04-12',
  };

  beforeEach(() => {
    prismaMock = {
      cycle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO', farmId: 'farm-1' }),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ stockActual: 100 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'movement-1', ...data }),
        ),
      },
    };
    insumosServiceMock = {
      findActiveOwnedOrThrow: jest.fn().mockResolvedValue({ id: 'insumo-1' }),
    };
    inventoryService = new InventoryService(
      prismaMock as unknown as PrismaService,
      insumosServiceMock as unknown as InsumosService,
      {} as unknown as AuditService,
    );
  });

  it('resta stock y asocia el movimiento al ciclo (sin transactionId, sin gasto nuevo)', async () => {
    const result = await inventoryService.registerConsumo(currentUser, dto);

    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: InventoryMovementTipo.SALIDA_CONSUMO,
        cantidad: -20,
        cycleId: 'cycle-1',
        transactionId: undefined,
        farmId: 'farm-1',
      }),
    });
    expect(result.movement.stockDespues).toBe(80);
    expect(result.warning).toBeNull();
  });

  it('no bloquea si el stock queda negativo, pero avisa con warning', async () => {
    prismaMock.inventory.findUnique.mockResolvedValue({ stockActual: 10 });

    const result = await inventoryService.registerConsumo(currentUser, dto); // consume 20, quedan -10

    expect(result.movement.stockDespues).toBe(-10);
    expect(result.warning).toMatch(/negativo/);
  });

  it('rechaza si el ciclo no pertenece a la company', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(inventoryService.registerConsumo(currentUser, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rechaza si el ciclo está CERRADO', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({ id: 'cycle-1', estado: 'CERRADO', farmId: 'farm-1' });
    await expect(inventoryService.registerConsumo(currentUser, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe('InventoryService.findMovements (HU-21)', () => {
  let prismaMock: { inventoryMovement: { findMany: jest.Mock } };
  let inventoryService: InventoryService;

  beforeEach(() => {
    prismaMock = { inventoryMovement: { findMany: jest.fn().mockResolvedValue([]) } };
    inventoryService = new InventoryService(
      prismaMock as unknown as PrismaService,
      {} as unknown as InsumosService,
      {} as unknown as AuditService,
    );
  });

  it('filtra por company y aplica los filtros opcionales', async () => {
    await inventoryService.findMovements('company-1', {
      farmId: 'farm-1',
      tipo: InventoryMovementTipo.AJUSTE_MANUAL,
    });

    expect(prismaMock.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          farm: { companyId: 'company-1' },
          farmId: 'farm-1',
          tipo: InventoryMovementTipo.AJUSTE_MANUAL,
        }),
      }),
    );
  });
});

describe('InventoryService.findStock / findAlerts (HU-23)', () => {
  let prismaMock: { inventory: { findMany: jest.Mock } };
  let inventoryService: InventoryService;

  const rowBajoUmbral = {
    stockActual: 30,
    farm: { id: 'farm-1', name: 'Estanque 1' },
    insumo: { id: 'insumo-1', name: 'Alimento flotante', unidadMedidaDefault: 'kg', umbralAlertaStock: 50 },
  };
  const rowSobreUmbral = {
    stockActual: 200,
    farm: { id: 'farm-1', name: 'Estanque 1' },
    insumo: { id: 'insumo-2', name: 'Sulfato de cobre', unidadMedidaDefault: 'kg', umbralAlertaStock: 10 },
  };
  const rowSinUmbral = {
    stockActual: 5,
    farm: { id: 'farm-1', name: 'Estanque 1' },
    insumo: { id: 'insumo-3', name: 'Alevinos', unidadMedidaDefault: 'unidad', umbralAlertaStock: null },
  };

  beforeEach(() => {
    prismaMock = {
      inventory: {
        findMany: jest.fn().mockResolvedValue([rowBajoUmbral, rowSobreUmbral, rowSinUmbral]),
      },
    };
    inventoryService = new InventoryService(
      prismaMock as unknown as PrismaService,
      {} as unknown as InsumosService,
      {} as unknown as AuditService,
    );
  });

  it('findStock marca bajoUmbral correctamente por fila', async () => {
    const result = await inventoryService.findStock('company-1', {});

    expect(result.find((r) => r.insumoId === 'insumo-1')?.bajoUmbral).toBe(true);
    expect(result.find((r) => r.insumoId === 'insumo-2')?.bajoUmbral).toBe(false);
    expect(result.find((r) => r.insumoId === 'insumo-3')?.bajoUmbral).toBe(false); // sin umbral configurado
  });

  it('findAlerts solo devuelve las filas bajoUmbral:true', async () => {
    const alerts = await inventoryService.findAlerts('company-1', {});

    expect(alerts).toHaveLength(1);
    expect(alerts[0].insumoId).toBe('insumo-1');
  });

  it('findStock filtra por company', async () => {
    await inventoryService.findStock('company-1', {});
    expect(prismaMock.inventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ farm: { companyId: 'company-1' } }) }),
    );
  });
});
