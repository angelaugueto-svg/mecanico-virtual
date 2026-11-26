# Prueba de punta a punta — Mecánico Virtual standalone (local)

**Fecha:** 26-nov-2026 · **URL local:** http://localhost:3000 · **Servidor:** corriendo (PID 8688, log `/tmp/mv-server.log`)
**Base de datos:** PostgreSQL 16 local, base `mecanico_virtual`, usuario `mecanico` (solo pruebas, vacía al inicio)
**Modo:** STUB (sin `ANTHROPIC_API_KEY`) — `health: {"ok":true,"stub":true,"smtp":false}`

## Resultado: TODO LO PROBADO PASÓ

| # | Prueba | Resultado |
|---|---|---|
| (a) | Registro usuario + teléfono, sin clave | ✅ Token, state `none`, teléfono normalizado a `0412-0000001` |
| (a) | Duplicado mismo teléfono / mismo usuario (sin distinguir mayúsculas) | ✅ `Ese número ya está registrado` / `Ese usuario ya lo tiene otra cuenta` |
| (a) | Login con usuario en minúsculas y teléfono sin 0 | ✅ Entra a la misma cuenta |
| (a) | Preguntar antes de pagar (congelado) | ✅ 403 `not-active` |
| (b) | Cargar pago (nombre, cédula, monto Bs, referencia, banco) | ✅ status `pending`; sesión state `pending` |
| (b) | Datos pago móvil en el paso del pago | ✅ Bancamiga 0172, 0426-5136094, V-14035968, sin titular |
| (c) | Panel: crear PIN de prueba, login | ✅ PIN `1234` (solo en esta base de PRUEBA); 2º set-pin → 403; PIN malo → 401 |
| (c) | Status / dashboard | ✅ pinSet true, pendingPayments 1, cliente y pago con todos los datos |
| (c) | Confirmar pago | ✅ Activo 1 mes: 2026-11-26 → 2026-12-26, daysLeft 30 |
| (c) | 2º pago a cliente ya activo / registrar cliente ya activo / referencia duplicada en minúsculas | ✅ `addedMonth: false`, aviso «ya estaba activo hasta el 2026-12-26: no se sumó otro mes», fecha sin tocar |
| (d) | Cheo 1ª pregunta del día | ✅ `greeting: true`, «¡Hola! Soy Cheo, el mecánico…» |
| (d) | Cheo 2ª pregunta mismo día | ✅ `greeting: false`, directo a la respuesta |
| (d) | Saludo al día siguiente (greeting_date = ayer) | ✅ `greeting: true` de nuevo |
| (d) | Modo `solved` («¡Era eso!») | ✅ «Entendido. Quedó anotado.» (corto y seco) |
| (d) | Modo `how-to` | ✅ Trae «Pasos:» (5 pasos); las respuestas normales NO llevan pasos |
| (d) | Repuestos reales del catálogo | ✅ Verificado contra la hoja en vivo (gviz CSV, 732 filas): AA-313007, AA-313001, AA-7-2, AA-956, AA-326, AA-1001 existen con su descripción; precio null → «Precio a consultar». Log: `[catalog] actualizado: 732 repuestos` |
| (e) | Plan vencido (ends_at en el pasado) | ✅ state `expired`, daysLeft 0, ask → 403 `not-active` |
| (e) | Reactivar desde el panel (set-active) | ✅ Nuevo mes 2026-11-26 → 2026-12-26 |
| (f) | Limpieza 48 h (manual, con filas envejecidas por SQL) | ✅ Borró 1 consulta vieja + 1 cliente sin pago (SinPago); CONSERVÓ al cliente con pago en revisión (ConPagoPendiente) y al que pagó alguna vez (PruebaMilton) |
| — | Export CSV (respaldo) | ✅ Clientes + períodos, HTTP 200 |
| — | Correo sin SMTP | ✅ Aviso queda en el log; registro/pago igual se guardan |
| — | Modo stub visible | ✅ Banner en el front: «Modo de prueba: respuestas de ejemplo, no es Cheo de verdad» (se activa por `health.stub` y `res.stub`); log del servidor: `modo Cheo: STUB` |
| — | Voz gratis (speechSynthesis) | ✅ Verificado en código: voz en español preferida (es-VE, es-ES, es-MX, es-US), pista de voz de hombre, velocidad 1; botón «🔊 Escuchar» en cada respuesta, NUNCA en el saludo; se oculta si no hay voz en español. **Sin prueba de audio real** (esta VM no tiene navegador/audio) |

## Observaciones menores (no bloquean)
1. El CSV de export muestra el período viejo vencido con status `active` (la columna no se actualiza al vencer; el estado vivo se calcula por fechas y la sesión sí mostró `expired`). Cosmético.
2. La limpieza de 48 h se probó envejeciendo filas por SQL, no esperando 48 h reales; el temporizador de 6 h no se observó disparar (se verificaron el endpoint manual y los disparadores de panel/historial/pregunta).
3. El cliente (página web) no se probó en un navegador real: banner, bocina y flujo visual son verificación por código. La API está probada de punta a punta.

## Lo que sigue faltando
- **`ANTHROPIC_API_KEY`** — sin ella Cheo responde con el stub (respuestas de ejemplo deterministas por síntoma, con el catálogo real). Para Cheo de verdad: poner la clave en `server/.env` y reiniciar. Modelo por defecto `claude-haiku-4-5` (ver DEPLOY.md: si ya no está disponible, cambiar a `claude-haiku-5.5`).
- **SMTP** (opcional): credenciales para los avisos a motolabaa@gmail.com; sin ellas los avisos solo quedan en el log y todo funciona.
- **Cuentas de hosting** (Render/Fly.io/Railway + Neon): no creadas; las crea Angela cuando decida (ver DEPLOY.md).
- **Prueba en teléfono/navegador real** del cliente (banner stub, bocina Escuchar, flujo completo).
- **Migración de clientes reales:** NO hecha (prohibido en esta fase; la versión de Muse no se tocó).

## Datos de prueba en esta base (NO son reales)
- Cliente `PruebaMilton` (0412-0000001), activo hasta 2026-12-26.
- Cliente `ConPagoPendiente` (0412-5556666), pago en revisión (ref PEND-0003).
- PIN del panel de prueba: `1234` (solo en esta base local).
