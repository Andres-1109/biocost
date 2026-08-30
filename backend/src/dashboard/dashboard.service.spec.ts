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
