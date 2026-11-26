# Mecánico Virtual Motolab AA — Backend (standalone, fuera de Muse)

Servidor Express + TypeScript + Drizzle ORM + PostgreSQL.
Cheo responde con la API de Anthropic (`claude-haiku-4-5` por defecto) o en **modo STUB**
si no hay `ANTHROPIC_API_KEY`. El catálogo se lee en vivo de Google Sheets (gviz CSV,
caché 5 min, con fallback a la última copia). Los correos a `motolabaa@gmail.com`
van por SMTP; sin SMTP se registra en el log y el registro/pago igual queda.

## Requisitos

- Node 20+ (probado con Node 24)
- PostgreSQL local o remoto

## Arranque

```bash
cd server
cp .env.example .env   # rellenar DATABASE_URL (y ANTHROPIC_API_KEY si hay)
npm install
npm run dev            # http://localhost:3000
```

Al arrancar aplica las migraciones de `migrations/` y siembra los datos del pago
móvil (Bancamiga 0172, 0426-5136094, V-14035968, titular vacío).

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compila a dist/
npm start           # node dist/server.js
```

El servidor sirve el frontend estático desde `../client/dist` si existe; si no
existe, la API sigue funcionando y `/` devuelve un JSON informativo.

## Endpoints (base `/api`)

Cliente (`Authorization: Bearer <token>`):

| Método | Ruta | Notas |
|---|---|---|
| POST | `/register` | `{username, phone}` → 200 `{token, client, state, planEndsAt}`; 409 si usuario/teléfono ya existe |
| POST | `/login` | `{username, phone}` → 200 como register; 404 si no existe |
| GET | `/session` | Estado, plan y `pagoMovil` solo en el paso del pago (`none`/`pending`) |
| POST | `/request-plan` | `{payerName, cedula, amountBs, reference, bank}` → pago en revisión |
| POST | `/ask` | `{message, mode?, causeIndex?, brand?, model?, year?, cc?}` → 403 si no está activo; `stub: true` en modo stub |
| GET | `/history` | Consultas del cliente (últimas 48 h) |
| GET | `/health` | `{ok, stub, smtp}` |

Panel (`Authorization: Bearer <admin-token>`, obtenido con el PIN):

| Método | Ruta | Notas |
|---|---|---|
| POST | `/admin/set-pin` | Solo si aún no hay PIN |
| POST | `/admin/login` | `{pin}` → `{adminToken}` |
| GET | `/admin/status` | `{pinSet, pagoMovil, pendingPayments}` |
| GET | `/admin/dashboard` | Clientes + pagos por confirmar (también corre la limpieza) |
| POST | `/admin/decide` | `{paymentId, decision: 'confirm' \| 'reject'}` |
| POST | `/admin/register-client` | `{username, phone, bank, reference}` → activa 1 mes |
| POST | `/admin/set-active` | `{clientId, active}` — desactivar corta el acceso al momento |
| POST | `/admin/save-pago-movil` | `{bank, phone, cedula}` (titular siempre vacío) |
| GET | `/admin/export` | CSV de clientes y períodos (respaldo) |
| POST | `/admin/cleanup` | Limpieza manual |

## Reglas clave implementadas

- Plan único $3/mes, preguntas ilimitadas; 1 mes calendario desde la activación.
- Registro solo usuario + teléfono (sin clave ni nombre real). Usuario único sin
  distinguir mayúsculas; teléfono normalizado a `0412…`.
- Quien se registra y no paga queda congelado en el paso del pago; `ask` rechaza
  con 403 `not-active`.
- Referencias comparadas sin mayúsculas/minúsculas. Confirmar un pago o registrar
  a alguien que ya está activo **no suma otro mes** (se avisa en la respuesta).
- Cheo saluda solo en la primera pregunta de cada día (marca `greeting_date` por
  cliente y día, en America/Caracas). Respuestas cortas, sin invitar a seguir
  preguntando; «solved» cierra con una frase corta y seca.
- Limpieza cada 6 h: borra consultas de más de 48 h y clientes sin pago y sin
  período de más de 48 h. Un pago en revisión protege la tarjeta; quien pagó
  alguna vez la conserva aunque venció.
- Sin pasarela de pago. Sin voz pagada (el front usa Web Speech API del
  dispositivo; este backend no tiene nada de voz).

## Modo STUB (sin clave de Anthropic)

`ask` responde con causas deterministas según el síntoma (no enciende → bujía /
batería / carburador; ruido → cadena / frenos; se apaga → filtro / carburador /
bujía; frenos; batería/luces), usando solo repuestos del catálogo cargado, con el
mismo formato que el real y `stub: true` en la respuesta y en el log.
Para la prueba real con Cheo de verdad solo falta poner `ANTHROPIC_API_KEY` en
el `.env` y reiniciar: el front muestra «Modo de prueba» mientras el stub esté activo.

## Migraciones

`migrations/0001_init.sql` crea las tablas `clients`, `sessions`,
`access_periods`, `payments`, `consultations` y `settings`. Se aplican solas al
arrancar (tabla `applied_migrations`); para agregar una, crear `0002_….sql`.
