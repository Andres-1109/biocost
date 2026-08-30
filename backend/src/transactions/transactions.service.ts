import { BadRequestException, Injectable } from '@nestjs/common';
import { CicloEstado, Transaction, TransaccionTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { InsumosService } from '../insumos/insumos.service';
import { CreateEgresoDto } from './dto/create-egreso.dto';
import { CreateIngresoDto } from './dto/create-ingreso.dto';
import { categoriaRequiresInsumo, CATEGORIES_REQUIRING_INSUMO } from './transaction-categories.constants';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insumosService: InsumosService,
  ) {}

  // HU-14: registrar un egreso. Solo sobre ciclos ACTIVO de la propia
  // company. Si la categoría es Alimento concentrado o Insumos químicos,
  // exige un insumoId del catálogo consistente con esa categoría.
  async createEgreso(currentUser: RequestUser, dto: CreateEgresoDto): Promise<Transaction> {
    await this.assertCycleOwnedAndActive(currentUser.companyId, dto.cycleId);
    const insumoId = await this.resolveInsumoId(currentUser.companyId, dto.categoria, dto.insumoId);

    return this.prisma.transaction.create({
      data: {
        cycleId: dto.cycleId,
        tipo: TransaccionTipo.EGRESO,
        categoria: dto.categoria,
        monto: dto.monto,
        fecha: new Date(dto.fecha),
        cantidad: dto.cantidad,
        unidadMedida: dto.unidadMedida,
        descripcion: dto.descripcion,
        facturaUrl: dto.facturaUrl,
        insumoId,
        createdByMembershipId: currentUser.membershipId,
        createdById: currentUser.userId,
      },
    });
  }

  // HU-15: registrar un ingreso. Mismo patrón de validación de ciclo que
  // el egreso; los ingresos nunca referencian un insumo.
  async createIngreso(currentUser: RequestUser, dto: CreateIngresoDto): Promise<Transaction> {
    await this.assertCycleOwnedAndActive(currentUser.companyId, dto.cycleId);

    return this.prisma.transaction.create({
      data: {
        cycleId: dto.cycleId,
        tipo: TransaccionTipo.INGRESO,
        categoria: dto.categoria,
        monto: dto.monto,
        fecha: new Date(dto.fecha),
        cantidad: dto.cantidad,
        unidadMedida: dto.unidadMedida,
        descripcion: dto.descripcion,
        facturaUrl: dto.facturaUrl,
        createdByMembershipId: currentUser.membershipId,
        createdById: currentUser.userId,
      },
    });
  }

  private async resolveInsumoId(
    companyId: string,
    categoria: CreateEgresoDto['categoria'],
    insumoId: string | undefined,
  ): Promise<string | undefined> {
    const expectedCategoriaPadre = CATEGORIES_REQUIRING_INSUMO[categoria];

    if (!expectedCategoriaPadre) {
      if (insumoId) {
        throw new BadRequestException(
          `La categoría "${categoria}" no admite referenciar un insumo.`,
        );
      }
      return undefined;
    }

    if (!insumoId) {
      throw new BadRequestException(
        `La categoría "${categoria}" requiere seleccionar un insumo del catálogo.`,
      );
    }

    const insumo = await this.insumosService.findOwnedOrThrow(companyId, insumoId);
    if (insumo.categoriaPadre !== expectedCategoriaPadre) {
      throw new BadRequestException(
        `El insumo seleccionado no es de categoría ${expectedCategoriaPadre}.`,
      );
    }

    return insumoId;
  }

  private async assertCycleOwnedAndActive(companyId: string, cycleId: string): Promise<void> {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });

    if (!cycle) {
      throw new BadRequestException('El ciclo indicado no existe o no pertenece a tu empresa.');
    }

    if (cycle.estado !== CicloEstado.ACTIVO) {
      throw new BadRequestException('Solo se pueden registrar transacciones sobre ciclos activos.');
    }
  }
}
