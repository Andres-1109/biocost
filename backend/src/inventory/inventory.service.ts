import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntidad,
  CicloEstado,
  InventoryMovement,
  InventoryMovementTipo,
  Prisma,
} from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { RegisterAjusteDto } from './dto/register-ajuste.dto';
import { RegisterConsumoDto } from './dto/register-consumo.dto';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

interface ApplyMovementParams {
  farmId: string;
  insumoId: string;
  tipo: InventoryMovementTipo;
  // Delta de stock: positivo suma, negativo resta.
  delta: number;
  membershipId: string;
  userId: string;
  fecha: Date;
  motivo?: string;
  transactionId?: string;
  cycleId?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insumosService: InsumosService,
    private readonly auditService: AuditService,
  ) {}

  // Núcleo compartido por HU-20 (entrada), HU-21 (ajuste) y HU-22 (consumo):
  // hace upsert de Inventory.stockActual y deja rastro en InventoryMovement
  // con stockAntes/stockDespues. Acepta un cliente Prisma opcional para
  // poder participar en la MISMA transacción de DB que quien la llama (ej.
  // TransactionsService.createEgreso en HU-20) — así "compra genera la
  // transacción Y el movimiento" es atómico de verdad.
  async applyMovement(
    params: ApplyMovementParams,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<InventoryMovement> {
    const existing = await client.inventory.findUnique({
      where: { farmId_insumoId: { farmId: params.farmId, insumoId: params.insumoId } },
    });

    const stockAntes = existing ? Number(existing.stockActual) : 0;
    const stockDespues = stockAntes + params.delta;

    await client.inventory.upsert({
      where: { farmId_insumoId: { farmId: params.farmId, insumoId: params.insumoId } },
      create: { farmId: params.farmId, insumoId: params.insumoId, stockActual: stockDespues },
      update: { stockActual: stockDespues },
    });

    return client.inventoryMovement.create({
      data: {
        farmId: params.farmId,
        insumoId: params.insumoId,
        tipo: params.tipo,
        cantidad: params.delta,
        stockAntes,
        stockDespues,
        motivo: params.motivo,
        transactionId: params.transactionId,
        cycleId: params.cycleId,
        createdByMembershipId: params.membershipId,
        userId: params.userId,
        fecha: params.fecha,
      },
    });
  }

  // HU-20: entrada por compra. Se llama desde dentro del $transaction de
  // TransactionsService.createEgreso — nunca se expone como endpoint propio,
  // el disparador es siempre un egreso de Alimento/Químicos con cantidad.
  async registerEntradaCompra(
    params: Omit<ApplyMovementParams, 'tipo' | 'delta'> & { cantidad: number },
    client: PrismaClientOrTx,
  ): Promise<InventoryMovement> {
    return this.applyMovement(
      { ...params, tipo: InventoryMovementTipo.ENTRADA_COMPRA, delta: params.cantidad },
      client,
    );
  }

  // HU-21: ajuste manual (positivo o negativo), motivo obligatorio, no
  // afecta ningún KPI financiero (no toca Transaction para nada) y queda
  // registrado en AuditLog — el mismo AuditService que ya usa HU-17.
  async registerAjusteManual(currentUser: RequestUser, dto: RegisterAjusteDto) {
    await this.assertFarmOwned(currentUser.companyId, dto.farmId);
    await this.insumosService.findActiveOwnedOrThrow(currentUser.companyId, dto.insumoId);

    const movement = await this.applyMovement({
      farmId: dto.farmId,
      insumoId: dto.insumoId,
      tipo: InventoryMovementTipo.AJUSTE_MANUAL,
      delta: dto.cantidad,
      motivo: dto.motivo,
      membershipId: currentUser.membershipId,
      userId: currentUser.userId,
      fecha: new Date(dto.fecha),
    });

    await this.auditService.record({
      companyId: currentUser.companyId,
      userId: currentUser.userId,
      action: AuditAction.CREAR,
      entidad: AuditEntidad.INVENTARIO,
      entidadId: movement.id,
      valoresDespues: {
        insumoId: dto.insumoId,
        cantidad: dto.cantidad,
        motivo: dto.motivo,
        stockAntes: movement.stockAntes.toString(),
        stockDespues: movement.stockDespues.toString(),
      },
    });

    return movement;
  }

  // HU-22: consumo de un insumo en un ciclo (ej. alimentar peces con stock
  // ya comprado) — resta stock, sin generar ninguna Transaction nueva (el
  // gasto ya se registró al comprar, HU-20). Si el stock resultante queda
  // negativo NO se bloquea (el registro físico puede ir por delante del
  // digital) — se avisa con `warning` en la respuesta.
  async registerConsumo(currentUser: RequestUser, dto: RegisterConsumoDto) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: dto.cycleId, farm: { companyId: currentUser.companyId } },
    });
    if (!cycle) {
      throw new BadRequestException('El ciclo indicado no existe o no pertenece a tu empresa.');
    }
    if (cycle.estado !== CicloEstado.ACTIVO) {
      throw new BadRequestException('Solo se puede registrar consumo sobre ciclos activos.');
    }

    await this.insumosService.findActiveOwnedOrThrow(currentUser.companyId, dto.insumoId);

    const movement = await this.applyMovement({
      farmId: cycle.farmId,
      insumoId: dto.insumoId,
      tipo: InventoryMovementTipo.SALIDA_CONSUMO,
      delta: -dto.cantidad,
      membershipId: currentUser.membershipId,
      userId: currentUser.userId,
      fecha: new Date(dto.fecha),
      cycleId: dto.cycleId,
    });

    return {
      movement,
      warning:
        Number(movement.stockDespues) < 0
          ? 'El stock quedó en negativo — revisa el conteo físico.'
          : null,
    };
  }

  // HU-21: historial de movimientos — el campo `tipo` ya distingue
  // visualmente entradas, consumos y ajustes manuales.
  async findMovements(companyId: string, query: ListMovementsQueryDto) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        farm: { companyId },
        ...(query.farmId ? { farmId: query.farmId } : {}),
        ...(query.insumoId ? { insumoId: query.insumoId } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
      },
      orderBy: { fecha: 'desc' },
      include: { insumo: { select: { name: true, unidadMedidaDefault: true } } },
    });
  }

  // HU-23: stock actual por Farm+Insumo, con bajoUmbral calculado. El
  // "inventario total de la empresa" (sección 3/CLAUDE.md) es la suma de
  // estas filas agrupadas por insumo si se quiere consolidar — no es una
  // tabla propia, así que no hace falta un endpoint aparte para eso.
  async findStock(companyId: string, query: ListStockQueryDto) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        farm: { companyId },
        ...(query.farmId ? { farmId: query.farmId } : {}),
      },
      include: {
        insumo: { select: { id: true, name: true, unidadMedidaDefault: true, umbralAlertaStock: true } },
        farm: { select: { id: true, name: true } },
      },
      orderBy: { insumo: { name: 'asc' } },
    });

    return rows.map((row) => {
      const umbral = row.insumo.umbralAlertaStock;
      const bajoUmbral = umbral != null && Number(row.stockActual) < Number(umbral);
      return {
        farmId: row.farm.id,
        farmName: row.farm.name,
        insumoId: row.insumo.id,
        insumoName: row.insumo.name,
        unidadMedida: row.insumo.unidadMedidaDefault,
        stockActual: row.stockActual,
        umbralAlertaStock: umbral,
        bajoUmbral,
      };
    });
  }

  // HU-23: mismo listado, solo los que están por debajo de su umbral.
  async findAlerts(companyId: string, query: ListStockQueryDto) {
    const stock = await this.findStock(companyId, query);
    return stock.filter((row) => row.bajoUmbral);
  }

  private async assertFarmOwned(companyId: string, farmId: string): Promise<void> {
    const farm = await this.prisma.farm.findFirst({ where: { id: farmId, companyId } });
    if (!farm) {
      throw new NotFoundException('Finca no encontrada.');
    }
  }
}
