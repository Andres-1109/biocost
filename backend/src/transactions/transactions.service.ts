import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntidad,
  CicloEstado,
  Prisma,
  Role,
  Transaction,
  TransaccionTipo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { CreateEgresoDto } from './dto/create-egreso.dto';
import { CreateIngresoDto } from './dto/create-ingreso.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  CATEGORIES_REQUIRING_INSUMO,
  EGRESO_CATEGORIES,
  INGRESO_CATEGORIES,
} from './transaction-categories.constants';

type TransactionWithCycle = Transaction & { cycle: { estado: CicloEstado } };

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insumosService: InsumosService,
    private readonly auditService: AuditService,
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

  // HU-17: solo Admin (garantizado por el guard del controller). Solo
  // sobre transacciones de ciclos ACTIVO — corrige errores de digitación,
  // no reasigna tipo ni ciclo. Deja rastro en AuditLog con valores
  // antes/después.
  async update(
    currentUser: RequestUser,
    transactionId: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const existing = await this.findOwnedTransactionOrThrow(currentUser.companyId, transactionId);
    this.assertCycleActive(existing.cycle.estado);

    const effectiveCategoria = dto.categoria ?? existing.categoria;
    this.assertCategoriaMatchesTipo(existing.tipo, effectiveCategoria);

    const insumoId =
      existing.tipo === TransaccionTipo.EGRESO
        ? await this.resolveInsumoId(
            currentUser.companyId,
            effectiveCategoria,
            dto.insumoId !== undefined ? dto.insumoId : (existing.insumoId ?? undefined),
          )
        : undefined;

    const valoresAntes = this.toAuditSnapshot(existing);

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoria: dto.categoria,
        monto: dto.monto,
        fecha: dto.fecha ? new Date(dto.fecha) : undefined,
        cantidad: dto.cantidad,
        unidadMedida: dto.unidadMedida,
        descripcion: dto.descripcion,
        facturaUrl: dto.facturaUrl,
        insumoId: existing.tipo === TransaccionTipo.EGRESO ? insumoId : undefined,
        updatedById: currentUser.userId,
      },
    });

    await this.auditService.record({
      companyId: currentUser.companyId,
      userId: currentUser.userId,
      action: AuditAction.EDITAR,
      entidad: AuditEntidad.TRANSACCION,
      entidadId: transactionId,
      valoresAntes,
      valoresDespues: this.toAuditSnapshot(updated),
    });

    return updated;
  }

  // HU-17: eliminar (solo Admin, mismo guard). Solo sobre ciclos ACTIVO.
  async remove(currentUser: RequestUser, transactionId: string): Promise<void> {
    const existing = await this.findOwnedTransactionOrThrow(currentUser.companyId, transactionId);
    this.assertCycleActive(existing.cycle.estado);

    await this.prisma.transaction.delete({ where: { id: transactionId } });

    await this.auditService.record({
      companyId: currentUser.companyId,
      userId: currentUser.userId,
      action: AuditAction.ELIMINAR,
      entidad: AuditEntidad.TRANSACCION,
      entidadId: transactionId,
      valoresAntes: this.toAuditSnapshot(existing),
    });
  }

  // HU-18: historial con filtros combinables + paginación. Un Operador sin
  // permiso de dashboard (HU-08) solo ve su propio historial — se
  // re-consulta el Membership en cada request (no se confía en un flag
  // del access token, que puede quedar desactualizado hasta 15 min si el
  // admin le acaba de quitar/dar el permiso).
  async findAll(currentUser: RequestUser, query: ListTransactionsQueryDto) {
    const where: Prisma.TransactionWhereInput = {
      cycle: { farm: { companyId: currentUser.companyId } },
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
      ...(query.categoria ? { categoria: query.categoria } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            fecha: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    if (currentUser.role === Role.OPERADOR) {
      const membership = await this.prisma.membership.findUnique({
        where: { id: currentUser.membershipId },
        select: { puedeVerDashboard: true },
      });
      if (!membership?.puedeVerDashboard) {
        where.createdByMembershipId = currentUser.membershipId;
      }
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { createdByMembership: { include: { user: { select: { name: true } } } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: data.map((tx) => ({
        ...tx,
        registradoPor: tx.createdByMembership.user.name,
      })),
      total,
      page,
      pageSize,
    };
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

  private assertCycleActive(estado: CicloEstado): void {
    if (estado !== CicloEstado.ACTIVO) {
      throw new ConflictException(
        'Solo se pueden editar/eliminar transacciones de ciclos activos.',
      );
    }
  }

  private assertCategoriaMatchesTipo(
    tipo: TransaccionTipo,
    categoria: Transaction['categoria'],
  ): void {
    const validCategories = tipo === TransaccionTipo.EGRESO ? EGRESO_CATEGORIES : INGRESO_CATEGORIES;
    if (!validCategories.includes(categoria)) {
      throw new BadRequestException(
        `La categoría "${categoria}" no es válida para una transacción de tipo ${tipo}.`,
      );
    }
  }

  private async findOwnedTransactionOrThrow(
    companyId: string,
    transactionId: string,
  ): Promise<TransactionWithCycle> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, cycle: { farm: { companyId } } },
      include: { cycle: { select: { estado: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada.');
    }

    return transaction;
  }

  private toAuditSnapshot(tx: Transaction) {
    return {
      categoria: tx.categoria,
      monto: tx.monto.toString(),
      fecha: tx.fecha.toISOString(),
      cantidad: tx.cantidad?.toString() ?? null,
      unidadMedida: tx.unidadMedida,
      descripcion: tx.descripcion,
      facturaUrl: tx.facturaUrl,
      insumoId: tx.insumoId,
    };
  }
}
