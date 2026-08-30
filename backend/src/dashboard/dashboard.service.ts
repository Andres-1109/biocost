import { Injectable, NotFoundException } from '@nestjs/common';
import { CicloEstado, Prisma, TransaccionCategoria, TransaccionTipo } from '@prisma/client';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChartFiltersDto } from './dto/chart-filters.dto';
import { GetKpisQueryDto } from './dto/get-kpis-query.dto';

interface Financials {
  totalIngresos: number;
  totalEgresos: number;
  utilidadNeta: number;
  margenPorcentaje: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cyclesService: CyclesService,
  ) {}

  // HU-24: KPIs de un ciclo puntual (?cycleId=) o consolidado de todos los
  // ciclos ACTIVO de la company si no se especifica ninguno.
  async getKpis(companyId: string, query: GetKpisQueryDto) {
    if (query.cycleId) {
      return this.getSingleCycleKpis(companyId, query.cycleId);
    }
    return this.getConsolidatedKpis(companyId);
  }

  private async getSingleCycleKpis(companyId: string, cycleId: string) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo no encontrado.');
    }

    // CERRADO: lee el snapshot ya guardado por HU-12, no recalcula.
    // ACTIVO: cálculo en vivo, reutilizando CyclesService.calculateFinancials.
    const financials: Financials =
      cycle.estado === CicloEstado.CERRADO
        ? {
            totalIngresos: Number(cycle.totalIngresos ?? 0),
            totalEgresos: Number(cycle.totalEgresos ?? 0),
            utilidadNeta: Number(cycle.utilidadNeta ?? 0),
            margenPorcentaje: Number(cycle.margenPorcentaje ?? 0),
          }
        : await this.cyclesService.calculateFinancials(cycleId);

    const kgVendidos = await this.getKgVendidos({ cycleId });

    return this.toKpisResponse(cycleId, cycle.estado, financials, kgVendidos);
  }

  private async getConsolidatedKpis(companyId: string) {
    const activeCycles = await this.prisma.cycle.findMany({
      where: { farm: { companyId }, estado: CicloEstado.ACTIVO },
      select: { id: true },
    });
    const cycleIds = activeCycles.map((c) => c.id);

    if (cycleIds.length === 0) {
      return this.toKpisResponse(
        null,
        null,
        { totalIngresos: 0, totalEgresos: 0, utilidadNeta: 0, margenPorcentaje: 0 },
        0,
        0,
      );
    }

    const [ingresos, egresos] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { cycleId: { in: cycleIds }, tipo: TransaccionTipo.INGRESO },
        _sum: { monto: true },
      }),
      this.prisma.transaction.aggregate({
        where: { cycleId: { in: cycleIds }, tipo: TransaccionTipo.EGRESO },
        _sum: { monto: true },
      }),
    ]);

    const totalIngresos = Number(ingresos._sum.monto ?? 0);
    const totalEgresos = Number(egresos._sum.monto ?? 0);
    const utilidadNeta = totalIngresos - totalEgresos;
    const margenPorcentaje = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    const kgVendidos = await this.getKgVendidos({ cycleIdIn: cycleIds });

    return this.toKpisResponse(
      null,
      'CONSOLIDADO',
      { totalIngresos, totalEgresos, utilidadNeta, margenPorcentaje },
      kgVendidos,
      cycleIds.length,
    );
  }

  // HU-25 (barras): ingresos vs egresos agrupados por mes. Prisma no
  // soporta agrupar por fecha truncada sin SQL crudo, así que se trae el
  // set filtrado y se agrupa en JS — mismo estilo que el resto del
  // proyecto (ver HU-13, HU-18).
  async getIngresosEgresosPorMes(companyId: string, filters: ChartFiltersDto) {
    const transactions = await this.prisma.transaction.findMany({
      where: this.buildScopedWhere(companyId, filters),
      select: { tipo: true, monto: true, fecha: true },
      orderBy: { fecha: 'asc' },
    });

    const byMonth = new Map<string, { ingresos: number; egresos: number }>();
    for (const tx of transactions) {
      const key = tx.fecha.toISOString().slice(0, 7); // YYYY-MM
      const bucket = byMonth.get(key) ?? { ingresos: 0, egresos: 0 };
      if (tx.tipo === TransaccionTipo.INGRESO) bucket.ingresos += Number(tx.monto);
      else bucket.egresos += Number(tx.monto);
      byMonth.set(key, bucket);
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, { ingresos, egresos }]) => ({ mes, ingresos, egresos }));
  }

  // HU-25 (línea): evolución de utilidad acumulada a lo largo de UN ciclo.
  async getEvolucionUtilidad(companyId: string, cycleId: string) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo no encontrado.');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { cycleId },
      select: { tipo: true, monto: true, fecha: true },
      orderBy: { fecha: 'asc' },
    });

    const byDay = new Map<string, number>();
    for (const tx of transactions) {
      const key = tx.fecha.toISOString().slice(0, 10); // YYYY-MM-DD
      const signedMonto = tx.tipo === TransaccionTipo.INGRESO ? Number(tx.monto) : -Number(tx.monto);
      byDay.set(key, (byDay.get(key) ?? 0) + signedMonto);
    }

    let acumulado = 0;
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, netoDelDia]) => {
        acumulado += netoDelDia;
        return { fecha, utilidadAcumulada: acumulado };
      });
  }

  // HU-25 (torta): distribución de egresos por categoría — categoria es
  // una columna real, así que sí se puede usar groupBy nativo de Prisma.
  async getEgresosPorCategoria(companyId: string, filters: ChartFiltersDto) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoria'],
      where: { ...this.buildScopedWhere(companyId, filters), tipo: TransaccionTipo.EGRESO },
      _sum: { monto: true },
    });

    return rows
      .map((row) => ({ categoria: row.categoria, monto: Number(row._sum.monto ?? 0) }))
      .sort((a, b) => b.monto - a.monto);
  }

  private buildScopedWhere(
    companyId: string,
    filters: ChartFiltersDto,
  ): Prisma.TransactionWhereInput {
    return {
      cycle: { farm: { companyId } },
      ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            fecha: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  // "Costo por kg producido" (HU-24) no tiene campo persistido en el
  // snapshot de Cycle — se usa como proxy los kg vendidos (Transaction de
  // categoría VENTA_PESCADO en unidad kg). Se calcula siempre en vivo,
  // incluso para ciclos CERRADO: sus transacciones son inmutables (HU-17
  // solo permite editar ciclos ACTIVO), así que es estable.
  private async getKgVendidos(
    scope: { cycleId: string } | { cycleIdIn: string[] },
  ): Promise<number> {
    const cycleFilter = 'cycleId' in scope ? { cycleId: scope.cycleId } : { cycleId: { in: scope.cycleIdIn } };

    const result = await this.prisma.transaction.aggregate({
      where: {
        ...cycleFilter,
        tipo: TransaccionTipo.INGRESO,
        categoria: TransaccionCategoria.VENTA_PESCADO,
        unidadMedida: { equals: 'kg', mode: 'insensitive' },
      },
      _sum: { cantidad: true },
    });

    return Number(result._sum.cantidad ?? 0);
  }

  private toKpisResponse(
    cycleId: string | null,
    estado: string | null,
    financials: Financials,
    kgVendidos: number,
    cyclesCount?: number,
  ) {
    return {
      cycleId,
      estado,
      ...financials,
      costoTotal: financials.totalEgresos,
      kgVendidos,
      costoPorKgProducido: kgVendidos > 0 ? financials.totalEgresos / kgVendidos : null,
      ...(cyclesCount !== undefined ? { cyclesCount } : {}),
    };
  }
}
