import { InsumoCategoriaPadre, TransaccionCategoria } from '@prisma/client';

// TransaccionCategoria es un solo enum en Prisma (no puede condicionar el
// dominio de un campo según otro campo de la misma fila) — esta es la
// validación de aplicación que HU-14/HU-15 necesitan para que cada
// endpoint solo acepte las categorías que le corresponden.
export const EGRESO_CATEGORIES: TransaccionCategoria[] = [
  TransaccionCategoria.ALEVINOS,
  TransaccionCategoria.ALIMENTO_CONCENTRADO,
  TransaccionCategoria.INSUMOS_QUIMICOS,
  TransaccionCategoria.MANO_DE_OBRA,
  TransaccionCategoria.MANTENIMIENTO,
  TransaccionCategoria.SERVICIOS,
  TransaccionCategoria.TRANSPORTE,
  TransaccionCategoria.OTROS_EGRESOS,
];

export const INGRESO_CATEGORIES: TransaccionCategoria[] = [
  TransaccionCategoria.VENTA_PESCADO,
  TransaccionCategoria.VENTA_SUBPRODUCTOS,
  TransaccionCategoria.OTROS_INGRESOS,
];

// Categorías de egreso que exigen referenciar un insumo del catálogo
// (HU-14, HU-19), y a qué categoriaPadre de Insumo debe pertenecer.
export const CATEGORIES_REQUIRING_INSUMO: Partial<
  Record<TransaccionCategoria, InsumoCategoriaPadre>
> = {
  [TransaccionCategoria.ALIMENTO_CONCENTRADO]: InsumoCategoriaPadre.ALIMENTO,
  [TransaccionCategoria.INSUMOS_QUIMICOS]: InsumoCategoriaPadre.QUIMICO,
};

export function categoriaRequiresInsumo(categoria: TransaccionCategoria): boolean {
  return categoria in CATEGORIES_REQUIRING_INSUMO;
}
