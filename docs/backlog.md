# Historias de Usuario — Biocost
## Sistema de Información Web (PWA) para Gestión de Costos, Rentabilidad y Trazabilidad Financiera en Unidades Productivas Acuícolas

**Proyecto:** Unidad productiva "La Bendición" — Tasajera, Magdalena
**Periodo:** 16/04/2026 — 16/10/2026
**Stack:** Frontend (Vercel) · Backend NestJS + Express (Render) · PostgreSQL + Prisma (Neon) · Cloudflare R2 (archivos) · JWT (access + refresh) · Resend (emails)

> **v2** — Backlog revisado y ampliado el 25/08/2026. Se agregaron 3 historias nuevas (HU-05, HU-19, HU-21) y se ampliaron los criterios de aceptación de HU-02, HU-10 y HU-30. Total: 33 historias (antes 30).

---

## Convenciones

- **Formato:** Como `[rol]`, quiero `[acción]`, para `[beneficio]`.
- **Prioridad:** MVP (fase 1, obligatoria) / F2 (fase 2, deseable si sobra tiempo).
- **Roles:** `Admin` (dueño/administrador de empresa), `Operador` (registro diario), `Sistema` (procesos automáticos).
- Las historias marcadas **🆕** son nuevas respecto a la v1. Las marcadas **✏️** tuvieron criterios de aceptación ampliados.

---

## Épica 1 — Autenticación y gestión de cuentas

### HU-01 (MVP) — Registro self-service de empresa
Como **visitante**, quiero registrarme creando mi cuenta y mi empresa al mismo tiempo, para empezar a usar el sistema sin depender de un administrador externo.

**Criterios de aceptación:**
- Dado que el visitante completa nombre, email, contraseña y nombre de la empresa, cuando envía el formulario, entonces se crea un `User`, una `Company` y un `Membership` con rol `ADMIN`.
- La contraseña se almacena con hash (bcrypt/argon2), nunca en texto plano.
- Se valida que el email no esté previamente registrado.
- Se valida contraseña con mínimo 8 caracteres, al menos una mayúscula y un número.

### HU-02 (MVP) ✏️ — Login con email/contraseña
Como **usuario registrado**, quiero iniciar sesión con mi email y contraseña, para acceder a mi(s) empresa(s).

**Criterios de aceptación:**
- Se emite un **access token JWT** (expira en 15 min) y un **refresh token** (expira en 7 días, almacenado como cookie httpOnly + registro en DB para poder revocarlo).
- Si el usuario tiene más de un `Membership` activo, se le solicita seleccionar la empresa/rol con el que desea trabajar antes de entrar al dashboard.
- Credenciales inválidas devuelven error genérico (no se revela si el email existe o no, por seguridad).
- 🆕 **Rate limiting anti-fuerza bruta:** tras 5 intentos fallidos consecutivos para el mismo email, se bloquea el login para ese email durante 15 minutos, mostrando mensaje claro del tiempo de espera restante.

### HU-03 (MVP) — Renovación automática de sesión
Como **usuario autenticado**, quiero que mi sesión se renueve automáticamente mientras estoy activo, para no perder mi trabajo por expiración del token.

**Criterios de aceptación:**
- Cuando el access token expira, el frontend usa el refresh token para obtener uno nuevo de forma transparente.
- Si el refresh token también expiró o fue revocado, se redirige al login.
- El admin puede revocar sesiones activas de un usuario (ej. si sospecha acceso indebido).

### HU-04 (MVP) — Recuperación de contraseña
Como **usuario registrado**, quiero poder restablecer mi contraseña si la olvido, para no quedar bloqueado del sistema.

**Criterios de aceptación:**
- Al solicitar recuperación, se envía (vía Resend) un email con link de un solo uso, válido por 30 minutos.
- El link contiene un token firmado y de un solo uso; una vez usado, queda invalidado.
- Se aplica rate limiting (máx. 3 solicitudes por email cada 15 min) para evitar abuso.

### HU-05 (MVP) 🆕 — Cambio de contraseña autenticado
Como **usuario autenticado**, quiero cambiar mi contraseña desde mi perfil ingresando la actual, para mejorar mi seguridad sin depender del flujo de email.

**Criterios de aceptación:**
- El formulario exige contraseña actual + nueva contraseña (misma validación de fortaleza que HU-01: mínimo 8 caracteres, mayúscula y número).
- Si la contraseña actual ingresada es incorrecta, se rechaza el cambio con mensaje claro.
- Al cambiar la contraseña exitosamente, se revocan todas las demás sesiones/refresh tokens activos del usuario (excepto la sesión actual), por seguridad.

### HU-06 (MVP) — Creación de operadores por el Administrador
Como **Administrador**, quiero crear cuentas de operadores para mi empresa, para que el personal de campo pueda registrar información sin necesidad de auto-registrarse.

**Criterios de aceptación:**
- El admin ingresa email, nombre y contraseña temporal (o se genera automáticamente y se envía por correo).
- Se crea un `User` (si el email no existe aún en el sistema) y un `Membership` con rol `OPERADOR` vinculado a la empresa del admin.
- Si el email ya existe como `User` (la persona ya tiene cuenta en otra empresa), solo se crea el nuevo `Membership` — el usuario mantiene sus credenciales originales y ahora puede alternar entre empresas.

### HU-07 (MVP) — Desactivación (soft delete) de operadores
Como **Administrador**, quiero desactivar a un operador sin borrar su historial, para mantener la trazabilidad de quién registró cada transacción aunque la persona ya no trabaje en la empresa.

**Criterios de aceptación:**
- El `Membership` se marca con `activo = false` / `deletedAt`, nunca se elimina físicamente.
- El operador desactivado no puede iniciar sesión en esa empresa (si tiene membership en otra empresa, esa sigue activa).
- Las transacciones ya registradas por ese operador conservan su nombre visible ("Registrado por: [nombre]").

### HU-08 (MVP) — Control de acceso al dashboard por operador
Como **Administrador**, quiero decidir si un operador específico puede ver el dashboard de rentabilidad, para mantener esa información confidencial por defecto sin perder flexibilidad.

**Criterios de aceptación:**
- Por defecto, todo `Membership` con rol `OPERADOR` tiene `puedeVerDashboard = false`.
- El admin puede activar/desactivar este permiso individualmente desde la gestión de usuarios.
- Si `puedeVerDashboard = false`, el operador solo ve: formulario de registro de transacciones, su propio historial reciente, e inventario (para saber qué queda disponible).
- Los KPIs de rentabilidad, utilidad neta y comparativas entre ciclos quedan ocultos para ese operador.

---

## Épica 2 — Gestión de empresa y ubicaciones

### HU-09 (MVP) — Registro de datos de la empresa
Como **Administrador**, quiero registrar los datos formales de mi empresa (NIT, dirección, teléfono, logo), para que aparezcan en los reportes exportados.

**Criterios de aceptación:**
- Campos: nombre, NIT (opcional), dirección, teléfono, logo (imagen subida a Cloudflare R2, guardando solo el link en DB).
- Estos datos aparecen como membrete en los reportes PDF/Excel exportados.

### HU-10 (MVP) ✏️ — Gestión de fincas/unidades productivas
Como **Administrador**, quiero registrar una o varias fincas/unidades dentro de mi empresa, para organizar los ciclos de producción por ubicación física.

**Criterios de aceptación:**
- Una `Company` puede tener 1 o más `Farm` (nombre, ubicación/dirección).
- Todo `Ciclo` se asocia obligatoriamente a una `Farm`.
- El sistema funciona igual con una sola finca (caso actual de "La Bendición") sin fricción adicional.
- 🆕 El admin puede **editar** los datos de una finca ya creada (nombre, ubicación) desde el panel de gestión.
- 🆕 Una finca solo puede desactivarse (soft delete) si no tiene ciclos `ACTIVO` asociados; si los tiene, el sistema bloquea la acción con mensaje explicativo.

---

## Épica 3 — Ciclos de producción

### HU-11 (MVP) — Crear un ciclo de producción
Como **Administrador u Operador**, quiero crear un nuevo ciclo de producción indicando fecha de siembra y estanque/finca, para asociar todas las transacciones futuras a ese lote específico.

**Criterios de aceptación:**
- Campos obligatorios: finca, fecha de siembra, nombre/identificador del ciclo (ej. "Ciclo Tilapia Estanque 2 - Abril 2026").
- El ciclo queda en estado `ACTIVO` al crearse.
- Pueden existir múltiples ciclos `ACTIVO` simultáneamente (uno por estanque/finca).

### HU-12 (MVP) — Cerrar un ciclo de producción
Como **Administrador**, quiero cerrar un ciclo registrando la fecha de cosecha, para calcular su rentabilidad final y dejarlo disponible para comparación histórica.

**Criterios de aceptación:**
- Solo el Admin puede cerrar un ciclo (cambia estado a `CERRADO`).
- Al cerrar, el sistema calcula y almacena snapshot de: total ingresos, total egresos, utilidad neta, margen %.
- Un ciclo cerrado no admite nuevas transacciones asociadas (se bloquean desde el frontend y se valida en backend).

### HU-13 (MVP) — Listar y comparar ciclos históricos
Como **Administrador**, quiero ver una tabla comparativa de todos mis ciclos cerrados, para identificar cuáles fueron más rentables y tomar mejores decisiones futuras.

**Criterios de aceptación:**
- Vista de tabla/gráfico con: nombre del ciclo, finca, fechas, duración en días, utilidad neta, margen %.
- Ordenable por cualquier columna (ej. mayor a menor rentabilidad).
- Filtrable por finca y por rango de fechas.

---

## Épica 4 — Transacciones (ingresos y egresos)

### HU-14 (MVP) — Registrar un egreso
Como **Administrador u Operador**, quiero registrar un egreso indicando categoría, monto, cantidad/unidad y ciclo asociado, para llevar el control detallado de costos.

**Criterios de aceptación:**
- Categorías disponibles: Alevinos, Alimento concentrado, Insumos químicos/medicamentos, Mano de obra, Mantenimiento, Servicios, Transporte, Otros.
- Campos: categoría, monto (COP), fecha, cantidad + unidad de medida (cuando aplique, ej. kg), ciclo asociado, descripción/nota, factura (opcional).
- Si la categoría es "Alimento concentrado" o "Insumos químicos", el sistema descuenta automáticamente del inventario correspondiente (ver HU-22).
- Solo se pueden registrar egresos sobre ciclos en estado `ACTIVO`.

### HU-15 (MVP) — Registrar un ingreso
Como **Administrador u Operador**, quiero registrar un ingreso por venta de pescado u otros conceptos, para llevar el control de la facturación del ciclo.

**Criterios de aceptación:**
- Categorías: Venta de pescado (por kg o por unidad), Venta de subproductos, Otros ingresos.
- Campos: categoría, monto (COP), fecha, cantidad + unidad, ciclo asociado, descripción, factura (opcional).

### HU-16 (MVP) — Adjuntar factura/comprobante a una transacción
Como **Administrador u Operador**, quiero adjuntar una foto o PDF del comprobante a una transacción, para mejorar la trazabilidad y auditoría del gasto/ingreso.

**Criterios de aceptación:**
- Formatos permitidos: jpg, jpeg, png, pdf. Tamaño máximo: 5MB.
- El backend genera una URL prefirmada de Cloudflare R2; el archivo se sube directo desde el cliente al bucket.
- Solo se guarda el link (`facturaUrl`) en la base de datos, nunca el binario del archivo.
- Es un campo opcional, no bloquea el registro de la transacción.

### HU-17 (MVP) — Editar y eliminar transacciones (solo Admin)
Como **Administrador**, quiero poder editar o eliminar transacciones ya registradas, para corregir errores de digitación del equipo de campo.

**Criterios de aceptación:**
- Un Operador **no puede** editar ni eliminar ninguna transacción, incluida la suya propia, una vez guardada con conexión.
- Al editar/eliminar una transacción vinculada a inventario, el stock se recalcula correspondientemente.
- Se registra en un log de auditoría: quién editó/eliminó, cuándo, y valores anteriores (para trazabilidad).
- Solo se permite editar/eliminar transacciones de ciclos `ACTIVO` (no de ciclos cerrados).

### HU-18 (MVP) — Ver historial de transacciones con filtros
Como **Administrador u Operador**, quiero ver el historial de transacciones filtrado por fecha, ciclo o categoría, para revisar rápidamente lo registrado.

**Criterios de aceptación:**
- Filtros combinables: rango de fechas, ciclo, categoría, tipo (ingreso/egreso).
- Un Operador sin permiso de dashboard solo ve su propio historial de registros (no el de otros operadores ni el consolidado de la empresa).
- Paginación para listas largas.

---

## Épica 5 — Inventario de insumos

### HU-19 (MVP) 🆕 — Catálogo de insumos
Como **Administrador**, quiero crear y gestionar un catálogo de insumos específicos (más allá de la categoría genérica "Alimento" o "Químicos"), para llevar un inventario preciso por tipo de insumo.

**Criterios de aceptación:**
- El admin puede crear insumos con: nombre (ej. "Alimento flotante 32% proteína", "Alimento hundible", "Sulfato de cobre"), categoría padre (Alimento/Químico), unidad de medida por defecto, umbral de alerta de stock bajo propio.
- Al registrar un egreso de categoría "Alimento" o "Químicos" (HU-14), el usuario selecciona el insumo específico del catálogo en lugar de solo la categoría genérica.
- El admin puede desactivar (soft delete) un insumo del catálogo que ya no se use, sin perder el historial de movimientos donde participó.

### HU-20 (MVP) — Registrar entrada de inventario (compra de insumos)
Como **Administrador u Operador**, quiero registrar la compra de alimento concentrado o insumos químicos, para mantener actualizado el stock disponible.

**Criterios de aceptación:**
- Al registrar un egreso de categoría "Alimento" o "Químicos" con cantidad, se crea/actualiza automáticamente el registro de `Inventario` correspondiente (suma stock), según el insumo específico seleccionado del catálogo (HU-19).
- Se guarda tipo/nombre del insumo, cantidad, unidad de medida, fecha.

### HU-21 (MVP) 🆕 — Ajuste manual de inventario
Como **Administrador**, quiero registrar un ajuste manual de inventario indicando un motivo, para corregir diferencias entre el conteo físico real y el stock reflejado en el sistema.

**Criterios de aceptación:**
- El admin puede registrar un ajuste positivo o negativo de stock para un insumo específico, indicando: cantidad del ajuste, motivo obligatorio (ej. "merma", "conteo físico", "insumo dañado"), fecha.
- El ajuste no afecta los KPIs financieros de ingresos/egresos (no es una transacción de dinero), solo corrige el stock.
- Todo ajuste manual queda registrado en el log de auditoría (HU-32) con usuario, motivo, valores antes/después.
- El historial de movimientos del insumo muestra los ajustes manuales diferenciados visualmente de las entradas/salidas por transacción normal.

### HU-22 (MVP) — Descuento automático de inventario por consumo
Como **Sistema**, quiero descontar automáticamente el inventario cuando se registra el consumo de un insumo en un ciclo, para reflejar el stock real disponible sin depender de cálculos manuales.

**Criterios de aceptación:**
- Cuando se registra consumo de alimento/químico asociado a un ciclo, se resta del stock general del insumo.
- Si el stock resultante es negativo, se muestra advertencia (no necesariamente se bloquea, ya que el registro físico puede ir por delante del digital).

### HU-23 (MVP) — Alertas de stock bajo
Como **Administrador**, quiero recibir una alerta visual cuando el inventario de un insumo cae por debajo de un umbral, para reabastecer a tiempo y no interrumpir la producción.

**Criterios de aceptación:**
- El admin configura un umbral mínimo por insumo (ej. "Alertar si alimento flotante < 50kg") — ahora a nivel de insumo específico del catálogo (HU-19), no de categoría genérica.
- El dashboard muestra un indicador visual (badge/color) cuando el stock está por debajo del umbral.
- Notificación visible al iniciar sesión, sin necesidad de configurar email/push en el MVP.

---

## Épica 6 — Dashboard y reportes

### HU-24 (MVP) — Dashboard de KPIs de rentabilidad
Como **Administrador**, quiero ver un tablero con los indicadores clave del negocio, para tomar decisiones informadas sobre la operación.

**Criterios de aceptación:**
- KPIs mostrados: utilidad neta, margen de rentabilidad (%), costo total por ciclo, costo por kg producido, ingresos vs. egresos acumulados.
- Datos actualizados en tiempo real según transacciones registradas.
- Selector para ver KPIs de un ciclo específico o consolidado de todos los ciclos activos.

### HU-25 (MVP) — Gráficos visuales del dashboard
Como **Administrador**, quiero visualizar gráficos de barras, líneas y torta sobre mis finanzas, para entender tendencias de un vistazo.

**Criterios de aceptación:**
- Gráfico de barras: ingresos vs. egresos por mes.
- Gráfico de línea: evolución de utilidad a lo largo del ciclo activo.
- Gráfico de torta: distribución de egresos por categoría.
- Todos los gráficos respetan los filtros de fecha/ciclo aplicados.

### HU-26 (MVP) — Exportar reportes a Excel/PDF
Como **Administrador**, quiero exportar el resumen financiero de un ciclo a Excel o PDF, para compartirlo o usarlo en rendición de cuentas.

**Criterios de aceptación:**
- El PDF incluye membrete con datos de la empresa (HU-09).
- Contiene: resumen de KPIs, tabla de transacciones del ciclo, gráfico de distribución de egresos.
- Exportación Excel incluye el detalle línea por línea de todas las transacciones del ciclo (para auditoría).

---

## Épica 7 — PWA y funcionamiento offline

### HU-27 (MVP) — Instalación como app (PWA)
Como **Operador de campo**, quiero poder instalar la aplicación en mi celular como un acceso directo, para usarla como una app nativa sin depender del navegador abierto.

**Criterios de aceptación:**
- Manifest.json configurado con ícono, nombre y colores de marca.
- El navegador muestra el prompt de "Instalar aplicación" en dispositivos compatibles.
- La app funciona en modo standalone (sin barra de navegador) una vez instalada.

### HU-28 (MVP) — Consulta de datos en caché sin conexión
Como **Operador de campo**, quiero poder ver el historial reciente y el inventario aunque no tenga señal, para saber qué se ha registrado sin depender de internet.

**Criterios de aceptación:**
- Service Worker (Workbox) cachea las últimas consultas de historial e inventario.
- Al perder conexión, se muestra un indicador claro de "modo offline" y los datos cacheados (con fecha de última actualización).

### HU-29 (MVP) — Registro de transacciones offline con sincronización posterior
Como **Operador de campo**, quiero poder registrar ingresos/egresos aunque no tenga conexión, para no perder información del día a día en zonas con mala señal.

**Criterios de aceptación:**
- Cada transacción creada offline recibe un **UUID generado en el cliente** y se guarda en una cola local (IndexedDB).
- Al recuperar conexión, el Service Worker sincroniza automáticamente la cola con el backend (Background Sync API o reintento al detectar `online`).
- Solo se permite **crear** transacciones en modo offline — **no editar ni eliminar** registros mientras se está sin conexión (evita conflictos de concurrencia).
- Una transacción offline puede eliminarse **únicamente si aún está en la cola local sin sincronizar** (el usuario se arrepiente antes de que suba).
- El usuario ve claramente cuáles registros están "pendientes de sincronizar" vs. "confirmados en servidor".

### HU-30 (MVP) ✏️ — Manejo de conflictos de sincronización
Como **Sistema**, quiero validar cada transacción offline al sincronizarla, para evitar inconsistencias (ej. ciclo cerrado entre tanto, o inventario insuficiente).

**Criterios de aceptación:**
- Si el ciclo asociado fue cerrado mientras el operador estaba offline, la transacción se marca como `RECHAZADA` con motivo visible, y no se pierde (queda registrada localmente para que el admin decida qué hacer).
- Si la sincronización es exitosa, la transacción pasa de estado local `PENDIENTE` a `SINCRONIZADA` y desaparece de la cola.
- Se aplica UUID como clave de idempotencia: si por reintento de red se reenvía la misma transacción, el backend la detecta y no la duplica.
- 🆕 El **propio Operador** que generó la transacción `RECHAZADA` la ve marcada claramente en su historial local (no solo el Admin), con el motivo del rechazo visible, para que sepa que debe corregirla o consultarlo con su Administrador.

---

## Épica 8 — Seguridad, auditoría y datos de ejemplo

### HU-31 (MVP) — Cifrado de datos sensibles
Como **Sistema**, quiero aplicar cifrado híbrido en los campos que lo requieran, para proteger la información sensible de la empresa y sus usuarios.

**Criterios de aceptación:**
- Contraseñas: hash con bcrypt/argon2 (no reversible).
- Datos sensibles en tránsito: HTTPS obligatorio en frontend (Vercel) y backend (Render).
- Campos sensibles en reposo que lo requieran (ej. NIT, si se considera dato sensible): cifrado simétrico (AES) con llave gestionada vía variables de entorno, combinado con hash donde no se necesite reversibilidad — es decir, **cifrado híbrido**: simétrico para datos que se deben leer de vuelta, hash para los que no.

### HU-32 (MVP) — Log de auditoría de acciones críticas
Como **Administrador**, quiero ver un registro de quién hizo qué y cuándo en las transacciones, para mantener trazabilidad financiera completa.

**Criterios de aceptación:**
- Se registra: usuario, acción (crear/editar/eliminar), entidad afectada, timestamp, valores antes/después (para ediciones).
- Incluye también los ajustes manuales de inventario (HU-21).
- Visible en una sección de "Historial de auditoría" accesible solo para Admin.

### HU-33 (MVP) — Seed de datos de ejemplo
Como **Desarrollador/Evaluador**, quiero contar con datos de ejemplo precargados, para poder probar y demostrar el sistema sin depender de datos reales del cliente.

**Criterios de aceptación:**
- Seed de Prisma crea: 1 empresa demo, 1 finca, catálogo de insumos con al menos 3 tipos (HU-19), 2 ciclos (uno cerrado con historial completo, uno activo), transacciones variadas en todas las categorías, inventario con al menos un insumo en alerta de stock bajo, al menos un ajuste manual de inventario de ejemplo (HU-21).
- Usuarios de prueba documentados en el README: `admin@demo.com / Demo1234` (Admin) y `operador@demo.com / Demo1234` (Operador).
- El seed es idempotente (se puede correr varias veces sin duplicar datos, o se limpia la DB antes de sembrar).

---

## Resumen de priorización sugerida (actualizado)

| Fase | Contenido |
|---|---|
| **Sprint 1** | HU-01 a HU-08 (Auth + usuarios, incluye cambio de contraseña) + HU-31 (seguridad base) |
| **Sprint 2** | HU-09, HU-10 (Empresa + fincas, con edición) + HU-11 a HU-13 (Ciclos) |
| **Sprint 3** | HU-14 a HU-18 (Transacciones) + HU-33 (seed) |
| **Sprint 4** | HU-19 a HU-23 (Inventario, incluye catálogo de insumos y ajustes manuales) |
| **Sprint 5** | HU-24 a HU-26 (Dashboard y reportes) |
| **Sprint 6** | HU-27 a HU-30 (PWA offline) — la más compleja, se deja con margen antes de la validación de campo |
| **Sprint 7** | HU-32 (auditoría) + validación de campo + ajustes finales |

*Todas las historias listadas son MVP dado el alcance confirmado; no se identificaron historias postergables a Fase 2 con la información actual, salvo Google OAuth (descartado) y edición offline (descartada por diseño, no por fase). Las 3 historias nuevas y las 3 ampliaciones se integraron dentro de los mismos sprints originales, sin alterar el cronograma general del proyecto.*
