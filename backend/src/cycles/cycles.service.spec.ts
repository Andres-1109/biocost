import { BadRequestException } from '@nestjs/common';
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
