import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FarmsService } from './farms.service';

describe('FarmsService (HU-10)', () => {
  let prismaMock: {
    farm: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    cycle: { count: jest.Mock };
  };
  let farmsService: FarmsService;

  const companyId = 'company-1';

  beforeEach(() => {
    prismaMock = {
      farm: {
        create: jest.fn().mockResolvedValue({ id: 'farm-1', name: 'Estanque 1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'farm-1' }),
      },
      cycle: { count: jest.fn().mockResolvedValue(0) },
    };
    farmsService = new FarmsService(prismaMock as unknown as PrismaService);
  });

  it('crea una finca asociada a la company', async () => {
    await farmsService.create(companyId, { name: 'Estanque 1', location: 'Tasajera' });
    expect(prismaMock.farm.create).toHaveBeenCalledWith({
      data: { companyId, name: 'Estanque 1', location: 'Tasajera' },
    });
  });

  it('lista las fincas de la company', async () => {
    await farmsService.findAllByCompany(companyId);
    expect(prismaMock.farm.findMany).toHaveBeenCalledWith({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('actualiza una finca que pertenece a la company', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId });

    await farmsService.update(companyId, 'farm-1', { name: 'Nuevo nombre' });

    expect(prismaMock.farm.update).toHaveBeenCalledWith({
      where: { id: 'farm-1' },
      data: { name: 'Nuevo nombre' },
    });
  });

  it('rechaza actualizar con 404 si la finca no pertenece a la company', async () => {
    prismaMock.farm.findFirst.mockResolvedValue(null);
    await expect(
      farmsService.update(companyId, 'farm-de-otra-empresa', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.farm.update).not.toHaveBeenCalled();
  });

  it('desactiva una finca sin ciclos activos', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId });
    prismaMock.cycle.count.mockResolvedValue(0);

    await farmsService.deactivate(companyId, 'farm-1');

    expect(prismaMock.farm.update).toHaveBeenCalledWith({
      where: { id: 'farm-1' },
      data: { activo: false, deletedAt: expect.any(Date) },
    });
  });

  it('bloquea la desactivación si la finca tiene ciclos ACTIVO (HU-10)', async () => {
    prismaMock.farm.findFirst.mockResolvedValue({ id: 'farm-1', companyId });
    prismaMock.cycle.count.mockResolvedValue(2);

    await expect(farmsService.deactivate(companyId, 'farm-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.farm.update).not.toHaveBeenCalled();
  });

  it('rechaza desactivar con 404 si la finca no pertenece a la company', async () => {
    prismaMock.farm.findFirst.mockResolvedValue(null);
    await expect(
      farmsService.deactivate(companyId, 'farm-de-otra-empresa'),
    ).rejects.toThrow(NotFoundException);
  });
});
