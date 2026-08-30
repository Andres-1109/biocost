import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InsumoCategoriaPadre } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsumosService } from './insumos.service';

describe('InsumosService (HU-14 catálogo mínimo + HU-19 completo)', () => {
  let prismaMock: {
    insumo: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let insumosService: InsumosService;

  const companyId = 'company-1';

  beforeEach(() => {
    prismaMock = {
      insumo: {
        create: jest.fn().mockResolvedValue({ id: 'insumo-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'insumo-1' }),
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

  it('findActiveOwnedOrThrow rechaza un insumo desactivado', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue({ id: 'insumo-1', companyId, activo: false });
    await expect(
      insumosService.findActiveOwnedOrThrow(companyId, 'insumo-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('findActiveOwnedOrThrow devuelve el insumo si está activo', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue({ id: 'insumo-1', companyId, activo: true });
    const result = await insumosService.findActiveOwnedOrThrow(companyId, 'insumo-1');
    expect(result.id).toBe('insumo-1');
  });

  it('update edita solo los campos presentes en el DTO', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue({ id: 'insumo-1', companyId });
    await insumosService.update(companyId, 'insumo-1', { umbralAlertaStock: 100 });
    expect(prismaMock.insumo.update).toHaveBeenCalledWith({
      where: { id: 'insumo-1' },
      data: { umbralAlertaStock: 100 },
    });
  });

  it('update rechaza con 404 si el insumo no pertenece a la company', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue(null);
    await expect(
      insumosService.update(companyId, 'insumo-ajeno', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.insumo.update).not.toHaveBeenCalled();
  });

  it('deactivate marca activo:false y deletedAt', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue({ id: 'insumo-1', companyId });
    await insumosService.deactivate(companyId, 'insumo-1');
    expect(prismaMock.insumo.update).toHaveBeenCalledWith({
      where: { id: 'insumo-1' },
      data: { activo: false, deletedAt: expect.any(Date) },
    });
  });

  it('deactivate rechaza con 404 si el insumo no pertenece a la company', async () => {
    prismaMock.insumo.findFirst.mockResolvedValue(null);
    await expect(insumosService.deactivate(companyId, 'insumo-ajeno')).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.insumo.update).not.toHaveBeenCalled();
  });
});
