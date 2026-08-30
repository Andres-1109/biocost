import { BadRequestException } from '@nestjs/common';
import { InsumoCategoriaPadre, Role, TransaccionCategoria } from '@prisma/client';
import { InsumosService } from '../insumos/insumos.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { TransactionsService } from './transactions.service';

describe('TransactionsService.createEgreso (HU-14)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock };
    transaction: { create: jest.Mock };
  };
  let insumosServiceMock: { findOwnedOrThrow: jest.Mock };
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
    insumosServiceMock = { findOwnedOrThrow: jest.fn() };
    transactionsService = new TransactionsService(
      prismaMock as unknown as PrismaService,
      insumosServiceMock as unknown as InsumosService,
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
    expect(insumosServiceMock.findOwnedOrThrow).not.toHaveBeenCalled();
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
    insumosServiceMock.findOwnedOrThrow.mockResolvedValue({
      id: 'insumo-1',
      categoriaPadre: InsumoCategoriaPadre.ALIMENTO,
    });

    await transactionsService.createEgreso(currentUser, {
      ...baseDto,
      categoria: TransaccionCategoria.ALIMENTO_CONCENTRADO,
      insumoId: 'insumo-1',
    });

    expect(insumosServiceMock.findOwnedOrThrow).toHaveBeenCalledWith('company-1', 'insumo-1');
    expect(prismaMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ insumoId: 'insumo-1' }),
    });
  });

  it('rechaza un insumo cuya categoriaPadre no coincide (ej. QUIMICO para un egreso de Alimento)', async () => {
    insumosServiceMock.findOwnedOrThrow.mockResolvedValue({
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
