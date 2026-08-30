import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { CompaniesService } from '../companies/companies.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const PIE_COLORS = [
  '#0f766e',
  '#f97316',
  '#6366f1',
  '#dc2626',
  '#0891b2',
  '#65a30d',
  '#c026d3',
  '#78716c',
  '#eab308',
  '#7c3aed',
  '#059669',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly dashboardService: DashboardService,
  ) {}

  // HU-26: hoja única, una fila por transacción del ciclo — para auditoría.
  async exportExcel(companyId: string, cycleId: string): Promise<Buffer> {
    const cycle = await this.findOwnedCycleOrThrow(companyId, cycleId);
    const transactions = await this.getCycleTransactions(cycleId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Ciclo ${cycle.name}`.slice(0, 31));

    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Categoría', key: 'categoria', width: 22 },
      { header: 'Monto (COP)', key: 'monto', width: 16 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Unidad', key: 'unidadMedida', width: 10 },
      { header: 'Descripción', key: 'descripcion', width: 30 },
      { header: 'Registrado por', key: 'registradoPor', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const tx of transactions) {
      sheet.addRow({
        fecha: tx.fecha.toISOString().slice(0, 10),
        tipo: tx.tipo,
        categoria: tx.categoria,
        monto: Number(tx.monto),
        cantidad: tx.cantidad ? Number(tx.cantidad) : null,
        unidadMedida: tx.unidadMedida,
        descripcion: tx.descripcion,
        registradoPor: tx.createdByMembership.user.name,
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // HU-26: membrete con datos de empresa (HU-09) + logo si está disponible,
  // resumen de KPIs (reutiliza DashboardService, HU-24), tabla de
  // transacciones y torta de egresos por categoría dibujada a mano con las
  // primitivas vectoriales de pdfkit (sin dependencias nativas).
  async exportPdf(companyId: string, cycleId: string): Promise<Buffer> {
    const cycle = await this.findOwnedCycleOrThrow(companyId, cycleId);
    const [company, kpis, egresosPorCategoria, transactions] = await Promise.all([
      this.companiesService.findById(companyId),
      this.dashboardService.getKpis(companyId, { cycleId }),
      this.dashboardService.getEgresosPorCategoria(companyId, { cycleId }),
      this.getCycleTransactions(cycleId),
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const bufferPromise = streamToBuffer(doc);

    await this.drawHeader(doc, company);
    this.drawKpiSummary(doc, cycle.name, kpis);
    this.drawEgresosPieChart(doc, egresosPorCategoria);
    this.drawTransactionsTable(doc, transactions);

    doc.end();
    return bufferPromise;
  }

  private async drawHeader(doc: PDFKit.PDFDocument, company: { name: string; nit: string | null; address: string | null; phone: string | null; logoUrl: string | null }) {
    let logoDrawn = false;
    if (company.logoUrl) {
      try {
        const response = await fetch(company.logoUrl);
        if (response.ok) {
          const imageBuffer = Buffer.from(await response.arrayBuffer());
          doc.image(imageBuffer, 40, 40, { width: 60, height: 60, fit: [60, 60] });
          logoDrawn = true;
        }
      } catch {
        // Logo no disponible — el membrete sigue solo con texto, no bloquea la exportación.
      }
    }

    const textX = logoDrawn ? 115 : 40;
    doc.fontSize(16).font('Helvetica-Bold').text(company.name, textX, 40);
    doc.fontSize(9).font('Helvetica');
    const detailLines = [
      company.nit ? `NIT: ${company.nit}` : null,
      company.address,
      company.phone,
    ].filter((line): line is string => !!line);
    doc.text(detailLines.join(' · '), textX, 60);

    doc.moveDown(3);
    doc.moveTo(40, 110).lineTo(555, 110).strokeColor('#cccccc').stroke();
    doc.y = 120;
  }

  private drawKpiSummary(
    doc: PDFKit.PDFDocument,
    cycleName: string,
    kpis: Awaited<ReturnType<DashboardService['getKpis']>>,
  ) {
    doc.fontSize(13).font('Helvetica-Bold').text(`Resumen del ciclo: ${cycleName}`, 40, doc.y + 10);
    doc.fontSize(10).font('Helvetica');

    const cop = (n: number) => `$${n.toLocaleString('es-CO')} COP`;
    const lines = [
      `Total ingresos: ${cop(kpis.totalIngresos)}`,
      `Total egresos (costo total): ${cop(kpis.totalEgresos)}`,
      `Utilidad neta: ${cop(kpis.utilidadNeta)}`,
      `Margen: ${kpis.margenPorcentaje.toFixed(2)}%`,
      kpis.costoPorKgProducido != null
        ? `Costo por kg producido: ${cop(kpis.costoPorKgProducido)}`
        : 'Costo por kg producido: sin datos de venta en kg',
    ];
    for (const line of lines) {
      doc.text(line, 40, doc.y + 4);
    }
    doc.moveDown(1);
  }

  private drawEgresosPieChart(
    doc: PDFKit.PDFDocument,
    egresos: { categoria: string; monto: number }[],
  ) {
    doc.fontSize(12).font('Helvetica-Bold').text('Distribución de egresos por categoría', 40, doc.y + 10);

    const total = egresos.reduce((sum, e) => sum + e.monto, 0);
    if (total === 0 || egresos.length === 0) {
      doc.fontSize(10).font('Helvetica').text('Sin egresos registrados en este ciclo.', 40, doc.y + 5);
      doc.moveDown(1);
      return;
    }

    const centerX = 110;
    const centerY = doc.y + 90;
    const radius = 70;
    let startAngle = -Math.PI / 2;

    egresos.forEach((entry, index) => {
      const sliceAngle = (entry.monto / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const color = PIE_COLORS[index % PIE_COLORS.length];

      doc.save();
      doc.moveTo(centerX, centerY);
      const steps = Math.max(2, Math.ceil((sliceAngle / (2 * Math.PI)) * 60));
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (sliceAngle * i) / steps;
        doc.lineTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
      }
      doc.lineTo(centerX, centerY);
      doc.fill(color);
      doc.restore();

      startAngle = endAngle;
    });

    // Leyenda al lado de la torta.
    let legendY = doc.y - 10;
    doc.fontSize(9).font('Helvetica');
    egresos.forEach((entry, index) => {
      const color = PIE_COLORS[index % PIE_COLORS.length];
      const pct = ((entry.monto / total) * 100).toFixed(1);
      doc.rect(220, legendY, 8, 8).fill(color);
      doc.fillColor('black').text(`${entry.categoria}: ${pct}%`, 234, legendY - 1);
      legendY += 14;
    });

    doc.y = centerY + radius + 20;
  }

  private drawTransactionsTable(
    doc: PDFKit.PDFDocument,
    transactions: Awaited<ReturnType<ReportsService['getCycleTransactions']>>,
  ) {
    doc.fontSize(12).font('Helvetica-Bold').text('Transacciones del ciclo', 40, doc.y + 15);
    doc.moveDown(0.5);

    const columns = [
      { label: 'Fecha', width: 60 },
      { label: 'Tipo', width: 55 },
      { label: 'Categoría', width: 140 },
      { label: 'Monto', width: 90 },
      { label: 'Registrado por', width: 130 },
    ];

    const drawRow = (values: string[], bold = false) => {
      if (doc.y > 760) {
        doc.addPage();
        doc.y = 40;
      }
      let x = 40;
      doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      values.forEach((value, i) => {
        doc.text(value, x, doc.y, { width: columns[i].width, ellipsis: true, lineBreak: false });
        x += columns[i].width;
      });
      doc.moveDown(1.2);
    };

    drawRow(columns.map((c) => c.label), true);
    for (const tx of transactions) {
      drawRow([
        tx.fecha.toISOString().slice(0, 10),
        tx.tipo,
        tx.categoria,
        `$${Number(tx.monto).toLocaleString('es-CO')}`,
        tx.createdByMembership.user.name,
      ]);
    }
  }

  private async findOwnedCycleOrThrow(companyId: string, cycleId: string) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo no encontrado.');
    }
    return cycle;
  }

  private async getCycleTransactions(cycleId: string) {
    return this.prisma.transaction.findMany({
      where: { cycleId },
      orderBy: { fecha: 'asc' },
      include: { createdByMembership: { include: { user: { select: { name: true } } } } },
    });
  }
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
