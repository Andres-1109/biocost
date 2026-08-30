import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CyclesService } from './cycles.service';

describe('CyclesService.create (HU-11)', () => {
  let prismaMock: {
    farm: { findFirst: jest.Mock };
    cycle: { create: jest.Mock };
  };
  let cyclesService: CyclesService;

  const companyId = 'company-1';
  const dto = { farmId: 'farm-1', name: 'Ciclo Tilapia Abril', seedDate: '2026-04-01' };

  beforeEach(() => {
    prismaMock = {
      farm: { findFirst: jest.fn() },
      cycle: {
        create: jest.fn().mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO' }),
      },
    };
    cyclesService = new CyclesService(prismaMock as unknown as PrismaService);
  });

  it('crea el ciclo cuando la finca pertenece a la company y está activa', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId, activo: true });

    await cyclesService.create(companyId, dto);

    expect(prismaMock.cycle.create).toHaveBeenCalledWith({
      data: { farmId: 'farm-1', name: dto.name, seedDate: new Date(dto.seedDate) },
    });
  });

  it('rechaza si la finca no pertenece a la company (o no existe)', async () => {
    prismaMock.farm.findFirst.mockResolvedValue(null);

    await expect(cyclesService.create(companyId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.cycle.create).not.toHaveBeenCalled();
  });

  it('rechaza si la finca está desactivada', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId, activo: false });

    await expect(cyclesService.create(companyId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.cycle.create).not.toHaveBeenCalled();
  });

  it('permite múltiples ciclos ACTIVO simultáneos (sin restricción de unicidad)', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId, activo: true });

    await cyclesService.create(companyId, dto);
    await cyclesService.create(companyId, { ...dto, name: 'Ciclo Tilapia Mayo' });

    expect(prismaMock.cycle.create).toHaveBeenCalledTimes(2);
  });
});

describe('CyclesService.close (HU-12)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock; update: jest.Mock };
    transaction: { aggregate: jest.Mock };
  };
  let cyclesService: CyclesService;

  const companyId = 'company-1';
  const closeDto = { harvestDate: '2026-07-01' };

  beforeEach(() => {
    prismaMock = {
      cycle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1', estado: 'ACTIVO' }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'cycle-1', ...data }),
        ),
      },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { monto: null } }),
      },
    };
    cyclesService = new CyclesService(prismaMock as unknown as PrismaService);
  });

  it('calcula el snapshot correctamente con ingresos y egresos', async () => {
    prismaMock.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { monto: 5_000_000 } }) // ingresos
      .mockResolvedValueOnce({ _sum: { monto: 3_200_000 } }); // egresos

    const result = await cyclesService.close(companyId, 'cycle-1', closeDto);

    expect(result.totalIngresos).toBe(5_000_000);
    expect(result.totalEgresos).toBe(3_200_000);
    expect(result.utilidadNeta).toBe(1_800_000);
    expect(result.margenPorcentaje).toBeCloseTo(36);
    expect(result.estado).toBe('CERRADO');
  });

  it('con cero transacciones da snapshot en 0 (Épica 4 no existe todavía)', async () => {
    const result = await cyclesService.close(companyId, 'cycle-1', closeDto);

    expect(result.totalIngresos).toBe(0);
    expect(result.totalEgresos).toBe(0);
    expect(result.utilidadNeta).toBe(0);
    expect(result.margenPorcentaje).toBe(0); // evita división por cero
  });

  it('rechaza con 404 si el ciclo no pertenece a la company', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue(null);
    await expect(
      cyclesService.close(companyId, 'cycle-de-otra-empresa', closeDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza cerrar un ciclo ya CERRADO', async () => {
    prismaMock.cycle.findFirst.mockResolvedValue({ id: 'cycle-1', estado: 'CERRADO' });
    await expect(cyclesService.close(companyId, 'cycle-1', closeDto)).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.cycle.update).not.toHaveBeenCalled();
  });
});

describe('CyclesService.findAll (HU-13)', () => {
  let prismaMock: { cycle: { findMany: jest.Mock } };
  let cyclesService: CyclesService;

  const companyId = 'company-1';

  const cycleA = {
    id: 'cycle-a',
    name: 'Ciclo A',
    estado: 'CERRADO',
    seedDate: new Date('2026-01-01'),
    harvestDate: new Date('2026-04-01'), // 90 días
    utilidadNeta: 1_000_000,
    margenPorcentaje: 20,
    farm: { id: 'farm-1', name: 'Estanque 1' },
  };

  beforeEach(() => {
    prismaMock = { cycle: { findMany: jest.fn().mockResolvedValue([cycleA]) } };
    cyclesService = new CyclesService(prismaMock as unknown as PrismaService);
  });

  it('filtra por defecto solo ciclos CERRADO de la company', async () => {
    await cyclesService.findAll(companyId, {});

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ farm: { companyId }, estado: 'CERRADO' }),
      }),
    );
  });

  it('aplica el filtro de finca cuando se especifica', async () => {
    await cyclesService.findAll(companyId, { farmId: 'farm-1' } as any);

    const callArgs = prismaMock.cycle.findMany.mock.calls[0][0];
    expect(callArgs.where.farmId).toBe('farm-1');
  });

  it('aplica el filtro de rango de fechas de cosecha', async () => {
    await cyclesService.findAll(companyId, {
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    } as any);

    const callArgs = prismaMock.cycle.findMany.mock.calls[0][0];
    expect(callArgs.where.harvestDate).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-12-31'),
    });
  });

  it('ordena por la columna y dirección solicitadas', async () => {
    await cyclesService.findAll(companyId, {
      sortBy: 'utilidadNeta',
      order: 'asc',
    } as any);

    const callArgs = prismaMock.cycle.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ utilidadNeta: 'asc' });
  });

  it('calcula durationDays y aplana los datos de finca en la respuesta', async () => {
    const [result] = await cyclesService.findAll(companyId, {});

    expect(result).toEqual({
      id: 'cycle-a',
      name: 'Ciclo A',
      farmId: 'farm-1',
      farmName: 'Estanque 1',
      estado: 'CERRADO',
      seedDate: cycleA.seedDate,
      harvestDate: cycleA.harvestDate,
      durationDays: 90,
      utilidadNeta: 1_000_000,
      margenPorcentaje: 20,
    });
  });
});
