import { InventoryMovementTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService (HU-20 núcleo compartido)', () => {
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
    inventoryService = new InventoryService({} as unknown as PrismaService);
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
