import { NotFoundException } from '@nestjs/common';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService.getKpis (HU-24)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock; findMany: jest.Mock };
    transaction: { aggregate: jest.Mock };
  };
  let cyclesServiceMock: { calculateFinancials: jest.Mock };
  let dashboardService: DashboardService;

  const companyId = 'company-1';

  beforeEach(() => {
    prismaMock = {
      cycle: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      transaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { monto: null, cantidad: null } }) },
    };
    cyclesServiceMock = { calculateFinancials: jest.fn() };
    dashboardService = new DashboardService(
      prismaMock as unknown as PrismaService,
      cyclesServiceMock as unknown as CyclesService,
    );
  });

  it('para un ciclo ACTIVO, calcula en vivo reutilizando CyclesService.calculateFinancials', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO' });
    cyclesServiceMock.calculateFinancials.mockResolvedValue({
      totalIngresos: 1_000_000,
      totalEgresos: 400_000,
      utilidadNeta: 600_000,
      margenPorcentaje: 60,
    });
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { cantidad: 100 } });

    const result = await dashboardService.getKpis(companyId, { cycleId: 'cycle-1' });

    expect(cyclesServiceMock.calculateFinancials).toHaveBeenCalledWith('cycle-1');
    expect(result.totalIngresos).toBe(1_000_000);
    expect(result.costoTotal).toBe(400_000);
    expect(result.kgVendidos).toBe(100);
    expect(result.costoPorKgProducido).toBe(4_000); // 400_000 / 100
  });

  it('para un ciclo CERRADO, lee el snapshot guardado SIN recalcular', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({
      id: 'cycle-1',
      estado: 'CERRADO',
      totalIngresos: 5_000_000,
      totalEgresos: 3_000_000,
      utilidadNeta: 2_000_000,
      margenPorcentaje: 40,
    });

    const result = await dashboardService.getKpis(companyId, { cycleId: 'cycle-1' });

    expect(cyclesServiceMock.calculateFinancials).not.toHaveBeenCalled();
    expect(result.totalIngresos).toBe(5_000_000);
    expect(result.margenPorcentaje).toBe(40);
  });

  it('rechaza con 404 si el ciclo no pertenece a la company', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(
      dashboardService.getKpis(companyId, { cycleId: 'cycle-ajeno' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('sin cycleId: consolida todos los ciclos ACTIVO de la company', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([{ id: 'cycle-1' }, { id: 'cycle-2' }]);
    prismaMock.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { monto: 8_000_000 } }) // ingresos
      .mockResolvedValueOnce({ _sum: { monto: 5_000_000 } }) // egresos
      .mockResolvedValueOnce({ _sum: { cantidad: 200 } }); // kg vendidos

    const result = await dashboardService.getKpis(companyId, {});

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { farm: { companyId }, estado: 'ACTIVO' } }),
    );
    expect(result.totalIngresos).toBe(8_000_000);
    expect(result.utilidadNeta).toBe(3_000_000);
    expect(result.cyclesCount).toBe(2);
  });

  it('consolidado con 0 ciclos ACTIVO devuelve todo en cero, sin consultar transacciones', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([]);

    const result = await dashboardService.getKpis(companyId, {});

    expect(prismaMock.transaction.aggregate).not.toHaveBeenCalled();
    expect(result.totalIngresos).toBe(0);
    expect(result.costoPorKgProducido).toBeNull();
    expect(result.cyclesCount).toBe(0);
  });
});

describe('DashboardService.getIngresosEgresosPorMes (HU-25)', () => {
  let prismaMock: { transaction: { findMany: jest.Mock } };
  let dashboardService: DashboardService;

  beforeEach(() => {
    prismaMock = { transaction: { findMany: jest.fn().mockResolvedValue([]) } };
    dashboardService = new DashboardService(
      prismaMock as unknown as PrismaService,
      {} as unknown as CyclesService,
    );
  });

  it('agrupa por mes y tipo correctamente', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { tipo: 'INGRESO', monto: 1_000_000, fecha: new Date('2026-04-05') },
      { tipo: 'EGRESO', monto: 300_000, fecha: new Date('2026-04-20') },
      { tipo: 'INGRESO', monto: 2_000_000, fecha: new Date('2026-05-01') },
    ]);

    const result = await dashboardService.getIngresosEgresosPorMes('company-1', {});

    expect(result).toEqual([
      { mes: '2026-04', ingresos: 1_000_000, egresos: 300_000 },
      { mes: '2026-05', ingresos: 2_000_000, egresos: 0 },
    ]);
  });

  it('aplica el scoping por company y los filtros de ciclo/fecha', async () => {
    await dashboardService.getIngresosEgresosPorMes('company-1', {
      cycleId: 'cycle-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });

    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cycle: { farm: { companyId: 'company-1' } },
          cycleId: 'cycle-1',
          fecha: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
        }),
      }),
    );
  });
});

describe('DashboardService.getEvolucionUtilidad (HU-25)', () => {
  let prismaMock: { cycle: { findFirst: jest.Mock }; transaction: { findMany: jest.Mock } };
  let dashboardService: DashboardService;

  beforeEach(() => {
    prismaMock = {
      cycle: { findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    dashboardService = new DashboardService(
      prismaMock as unknown as PrismaService,
      {} as unknown as CyclesService,
    );
  });

  it('calcula la utilidad acumulada día a día, en orden cronológico', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { tipo: 'INGRESO', monto: 1_000_000, fecha: new Date('2026-04-01') },
      { tipo: 'EGRESO', monto: 200_000, fecha: new Date('2026-04-01') },
      { tipo: 'EGRESO', monto: 300_000, fecha: new Date('2026-04-05') },
    ]);

    const result = await dashboardService.getEvolucionUtilidad('company-1', 'cycle-1');

    expect(result).toEqual([
      { fecha: '2026-04-01', utilidadAcumulada: 800_000 }, // 1M - 200k
      { fecha: '2026-04-05', utilidadAcumulada: 500_000 }, // 800k - 300k
    ]);
  });

  it('rechaza con 404 si el ciclo no pertenece a la company', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(
      dashboardService.getEvolucionUtilidad('company-1', 'cycle-ajeno'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('DashboardService.getEgresosPorCategoria (HU-25)', () => {
  let prismaMock: { transaction: { groupBy: jest.Mock } };
  let dashboardService: DashboardService;

  beforeEach(() => {
    prismaMock = { transaction: { groupBy: jest.fn().mockResolvedValue([]) } };
    dashboardService = new DashboardService(
      prismaMock as unknown as PrismaService,
      {} as unknown as CyclesService,
    );
  });

  it('devuelve el monto por categoría ordenado de mayor a menor', async () => {
    prismaMock.transaction.groupBy.mockResolvedValue([
      { categoria: 'MANO_DE_OBRA', _sum: { monto: 500_000 } },
      { categoria: 'ALIMENTO_CONCENTRADO', _sum: { monto: 2_000_000 } },
    ]);

    const result = await dashboardService.getEgresosPorCategoria('company-1', {});

    expect(result).toEqual([
      { categoria: 'ALIMENTO_CONCENTRADO', monto: 2_000_000 },
      { categoria: 'MANO_DE_OBRA', monto: 500_000 },
    ]);
    expect(prismaMock.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['categoria'],
        where: expect.objectContaining({ tipo: 'EGRESO' }),
      }),
    );
  });
});
