# PRD — Pan Administrador (Pan Con Miel)

## Problem Statement
Aplicación móvil (Expo/React Native) para la gestión de un negocio de ropa/comercio: inventario, ventas flexibles, gastos, analíticas gráficas, calculadora de márgenes y asistente de voz inteligente. Estética amigable (miel, blanco, azul suave, modo oscuro) con mascota de tostada kawaii.

## Architecture
- **Frontend:** Expo Router (file-based). Tabs: Inicio, Inventario, Ventas, Gastos, Reportes + FAB central de micrófono. Modales: product-form, voice, settings. Tema light/dark (ThemeContext), auth (AuthContext), datos (DataContext). Charts con react-native-gifted-charts. Fuente Nunito (expo-font). Teclado con react-native-keyboard-controller. Grabación con expo-audio (nativo) / MediaRecorder (web).
- **Backend:** FastAPI + MongoDB (motor). JWT (bcrypt) email/password. Rutas `/api/*`. Voz: Whisper (OpenAI) transcribe + Gemini 3 Flash parse, vía Emergent LLM key (emergentintegrations).
- **DB:** users, products, sales, expenses (soft-delete con deleted_at, scoping por user_id).

## User Personas
- Dueño/a de tienda de ropa que registra ventas, gastos e inventario desde el celular, incluso por voz.

## Core Requirements (static)
- Inventario con buscador, chips de categoría, badge de stock, form con slider de margen y precio sugerido auto (`costo/(1-margen/100)`), precio final editable.
- POS: buscador, precio editable por ítem, pago efectivo/transferencia/mixto, descuento de stock, ganancia neta.
- Gastos por tipo (mercancía/insumos/operativo) + método de pago.
- Asistente de voz: grabar → transcribir → interpretar (venta/gasto) → tarjeta de confirmación.
- Dashboard: balance efectivo vs transferencia, ingresos vs gastos, ganancia neta, filtros de tiempo, gráficos.
- Reportes: línea ventas, dona de gastos por categoría, top productos.
- Multi-moneda (PEN/USD/ARS/COP), modo oscuro.

## Implemented (2026-08-31)
- [x] Auth JWT email/password (register/login/me) + settings (currency/theme/name).
- [x] Productos CRUD (soft delete) con calculadora de margen.
- [x] Ventas con pago mixto + descuento/restauración de stock + ganancia.
- [x] Gastos CRUD por tipo/categoría/método.
- [x] Dashboard + Reportes con gráficos y rangos de tiempo.
- [x] Asistente de voz (Whisper + Gemini 3 Flash) con grabación nativa/web y fallback de texto.
- [x] Multi-moneda + modo oscuro + mascota kawaii (generada, fondo transparente).
- [x] Testing: 19/19 backend, todos los flujos E2E frontend.

## Implemented — Iteración 3: Rediseño visual "PanCon Miel" (2026-09-01)
- [x] Marca renombrada a "PanCon Miel" en toda la UI + app.json; copy onboarding "Bienvenido a tu rincón financiero dulce".
- [x] Sistema de color: primario azul #4A6FA5, degradado azul noche (#1A2E5C→#4A6FA5) en bienvenida/login/registro; resto fondo claro; acento miel #E89A3E SOLO en íconos/gráficos/FAB/detalles.
- [x] Botón primario azul tipo píldora; secundario outline; tarjetas blancas radio 22px con sombra suave.
- [x] Logo neón "PanCon Miel" y mascota en pijama (assets del usuario, fondo transparente) en bienvenida; avatar de mascota en el dashboard; formularios de auth en tarjeta blanca sobre degradado.
- [x] Gráficos con mezcla azul + miel. Sin cambios de funcionalidad.

## Implemented — Iteración 2 (2026-08-31)
- [x] Navegación: 4 pestañas [Inventario·Ventas·Gastos·Reportes] + micrófono central; Inicio y Ajustes en la barra superior (TopBar).
- [x] Micrófono dual (IA detecta intención): búsqueda universal vs registro (venta/gasto/alta de producto) con contexto por pantalla.
- [x] Categorías y subcategorías multinivel (taxonomía por usuario) con "+" para crear; 7 subcategorías sugeridas al crear categoría.
- [x] Margen de ganancia 0–300%; precio de venta "pendiente".
- [x] Gastos dinámicos: carrusel de tipos con "Otros…" (guardar como frecuente) + "+" categorías.
- [x] Subtipos de pago (Transferencia Bancaria, Tarjeta, Billetera Digital, POS, PayPal, Otros).
- [x] Ajustes: Euro + selector de monedas del mundo ("+") + gestor de categorías (añadir/eliminar).
- [x] Testing: 31/31 backend, todos los flujos nuevos E2E verificados.

## Backlog / Remaining
- P1: Exportación de reportes (PDF/Excel).
- P1: Rango personalizado de fechas en filtros.
- P2: Imágenes de producto (Object Storage).
- P2: Migrar warnings web-only (shadow*/pointerEvents/boxShadow) — no afecta nativo.

## Next Tasks
- Exportación de datos, rango de fechas personalizado, foto de producto.
