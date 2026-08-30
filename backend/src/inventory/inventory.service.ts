import { Injectable } from '@nestjs/common';
import { InventoryMovement, InventoryMovementTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
