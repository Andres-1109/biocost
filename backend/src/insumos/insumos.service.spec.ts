import { NotFoundException } from '@nestjs/common';
import { InsumoCategoriaPadre } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsumosService } from './insumos.service';

describe('InsumosService (prep HU-14 / catálogo mínimo)', () => {
  let prismaMock: {
    insumo: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  };
  let insumosService: InsumosService;

  const companyId = 'company-1';

  beforeEach(() => {
    prismaMock = {
      insumo: {
        create: jest.fn().mockResolvedValue({ id: 'insumo-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    insumosService = new InsumosService(prismaMock as unknown as PrismaService);
  });

  it('crea un insumo asociado a la company', async () => {
    await insumosService.create(companyId, {
      name: 'Alimento flotante 32%',
      categoriaPadre: InsumoCategoriaPadre.ALIMENTO,
      unidadMedidaDefault: 'kg',
      umbralAlertaStock: 50,
    });

    expect(prismaMock.insumo.create).toHaveBeenCalledWith({
      data: {
        companyId,
        name: 'Alimento flotante 32%',
        categoriaPadre: InsumoCategoriaPadre.ALIMENTO,
        unidadMedidaDefault: 'kg',
        umbralAlertaStock: 50,
      },
    });
  });

  it('lista solo los insumos activos de la company', async () => {
    await insumosService.findAllByCompany(companyId);
    expect(prismaMock.insumo.findMany).toHaveBeenCalledWith({
      where: { companyId, activo: true },
      orderBy: { name: 'asc' },
    });
  });

  it('findOwnedOrThrow lanza 404 si el insumo no pertenece a la company', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue(null);
    await expect(
      insumosService.findOwnedOrThrow(companyId, 'insumo-de-otra-empresa'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findOwnedOrThrow devuelve el insumo si pertenece a la company', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue({ id: 'insumo-1', companyId });
    const result = await insumosService.findOwnedOrThrow(companyId, 'insumo-1');
    expect(result.id).toBe('insumo-1');
  });
});
