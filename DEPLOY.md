# Despliegue — Mecánico Virtual Motolab AA (standalone)

Precios verificados por búsqueda web el **26-nov-2026** (fuentes: render.com/docs/free,
fly.io/pricing, docs.railway.com/pricing, neon.com/pricing, Anthropic vía OpenRouter).
Re-verificar en la página de facturación de cada proveedor al registrarse, antes de pagar.

## Recomendación

| Uso | Combinación | Costo mensual |
|---|---|---|
| **Probar ($0)** | Render web gratis + **Neon Free** (Postgres) | **$0** |
| **Siempre prendido, más barato** | Fly.io plan Free (crédito $5/mes cubre la máquina de $2.19) + **Neon Free** | **$0** dentro del crédito; ~$1–2 si se pasa |
| **Siempre prendido, simple** | Railway Hobby ($5, incluye $5 de uso) + Neon Free | **$5** fijos |

**Por qué Neon Free para la base y no el Postgres gratis de Render:** el de Render
**vence a los 30 días** (1 GB; 14 días de gracia y luego se borra si no se paga).
Neon Free es **permanente, sin tarjeta**: 1 GB por proyecto, 100 CU-horas/mes, se
duerme a los 5 min sin uso y despierta en menos de un segundo; si se acaban las
horas, se suspende hasta el mes siguiente (los datos NO se borran).

## Opción A — Render gratis (probar)

1. Crear cuenta en render.com (correo de Angela; no pide tarjeta para el plan gratis).
2. Crear la base en Neon (neon.com, gratis, sin tarjeta): nuevo proyecto → copiar la
   `DATABASE_URL` (la que empieza por `postgres://`).
3. En Render: New → Web Service → conectar el repositorio → Render detecta
   `render.yaml`. **OJO:** el blueprint trae una base Postgres gratis de Render;
   si se usa Neon, borrar esa base del blueprint o ignorarla (vence a los 30 días).
4. En el servicio web, Environment → poner `DATABASE_URL` (la de Neon) y, cuando
   Angela la dé, `ANTHROPIC_API_KEY`. Sin la clave, la app arranca en **modo STUB**
   (respuestas de ejemplo con el catálogo real; el front lo avisa).
5. Deploy. El enlace queda como `https://mecanico-virtual.onrender.com` (o el nombre
   que se elija). La primera visita tras 15 min sin uso tarda ~1 min (el servicio
   gratis se duerme).

Límites del gratis: web 512 MB / 0.1 CPU, se duerme a los 15 min, 750 horas gratis
por workspace al mes. Para siempre prendido: web Starter $7/mes + Postgres $6/mes
(≈ $13/mes).

## Opción B — Fly.io (siempre prendido, más barato)

1. Crear cuenta en fly.io (pide tarjeta para el plan Free; el plan Free da **$5 de
   uso al mes**).
2. Base en Neon Free como en la opción A.
3. Instalar `flyctl`, `fly auth login`, `fly launch --no-deploy` (aceptar `fly.toml`;
   el nombre de la app debe ser único), luego:
   `fly secrets set DATABASE_URL="<la de Neon>" ANTHROPIC_API_KEY="<cuando la dé Angela>"`
4. `fly deploy`. Enlace: `https://mecanico-virtual-motolab-aa.fly.dev`.

Costo: máquina shared-cpu-1x 256 MB = **$2.19/mes** (siempre prendida, sin dormir),
cubierta por el crédito de $5 del plan Free → **$0** mientras no se pase de $5.
Si se pasa, se cobra el exceso por uso (pago por uso, sin suscripción fija).

## Opción C — Railway Hobby ($5/mes)

1. Cuenta en railway.com (plan Hobby $5/mes, incluye $5 de uso; pide tarjeta
   postpago). Base en Neon Free como antes.
2. New Project → Deploy from GitHub → poner `DATABASE_URL` y `ANTHROPIC_API_KEY`
   en Variables. Railway detecta el `Dockerfile`.

Costo: **$5/mes fijos** (la cuota es un piso: si se usa menos de $5, igual se
pagan $5; si se usa más, se paga el uso).

## Variables de entorno (ver `server/.env.example`)

`DATABASE_URL` (obligatoria), `ANTHROPIC_API_KEY` (opcional → stub),
`ANTHROPIC_MODEL` (defecto `claude-haiku-4-5`), `SMTP_HOST/PORT/USER/PASS/FROM`
(opcional; sin SMTP solo se registra en el log), `PORT`, `SESSION_DAYS=30`,
`CATALOG_SHEET_ID` (ya viene con el de la lista real).

## Costos mensuales por pieza (verificados 26-nov-2026)

| Pieza | Costo | Notas |
|---|---|---|
| Servidor web (probar) | **$0** | Render gratis (se duerme) o Fly.io Free ($5 de crédito) |
| Servidor web (siempre prendido) | **$0–$5** | Fly.io $2.19 cubierto por el crédito → $0; Railway Hobby $5; Render Starter $7 |
| Base de datos Postgres | **$0** | Neon Free, permanente, sin tarjeta. Render gratis vence a los 30 días; Fly.io Postgres gestionado $4/mes (no hace falta) |
| Cerebro de Cheo (Anthropic) | **por uso, sin suscripción** | Haiku 4.5: $1 por millón de tokens de entrada, $5 por millón de salida. Estimación: una pregunta ≈ 3.000 tokens de entrada + 400 de salida ≈ **$0.005** → 100 preguntas ≈ $0.50/mes; 1.000 preguntas ≈ $5/mes. Se paga con créditos prepagos; si no se usa, no se paga |
| Voz | **$0** | Web Speech API del propio teléfono; sin servicio ni clave |
| Correo SMTP | **$0** | Gmail con contraseña de aplicación (gratis) |
| Catálogo (Google Sheets) | **$0** | Lectura pública de la lista; sin API de pago |
| **Total estimado al arrancar** | **$0/mes** | Render gratis o Fly.io Free + Neon Free + stub o poco uso de IA |
| **Total estimado en serio** | **~$2–$7/mes** | Servidor $0–$5 + IA según preguntas (~$0.50–$5) |

**Aviso sobre el modelo:** el backend usa `claude-haiku-4-5` por defecto (cambiable
con `ANTHROPIC_MODEL`). Una fuente (nov-2026) indica que su ventana mínima de
soporte («no antes del 15-oct-2026») ya pasó y que existe Haiku 5.5 a ~1/10 del
precio ($0.10/$0.50 por millón). Si al pedir la clave el modelo 4.5 ya no está
disponible, cambiar `ANTHROPIC_MODEL` a `claude-haiku-5.5` (una línea, sin tocar
código). Re-verificar el modelo vigente en la página de precios de Anthropic.

## Cómo se cancela cada pieza (sin multa, sin contrato)

- **Render:** Dashboard → servicio → Settings → Delete (o suspender). La
  facturación es mensual; al borrar el servicio se deja de cobrar. Antes de
  borrar, descargar el respaldo: `GET /api/admin/export` (CSV de clientes).
- **Fly.io:** `fly apps destroy <app>` o desde el panel; pago por uso mensual,
  «Cancel anytime». Al destruir la app se deja de cobrar.
- **Railway:** Project → Settings → Delete, o bajar el plan a Free ($0). La
  suscripción Hobby es mensual y se cancela cuando se quiera.
- **Neon:** panel → proyecto → Delete. El plan Free no tiene nada que cancelar
  (no hay tarjeta ni cobro).
- **Anthropic:** no hay suscripción mensual: se paga por uso con créditos
  prepagos. Para dejar de pagar: dejar de usar la clave, borrarla o desactivar
  la recarga automática en el panel de Anthropic.
- **Google Play ($25, solo si se publica la app algún día):** pago único, no es
  suscripción, no se cancela. Apple ($99/año, después): se cancela a la
  renovación anual.

## Lo que falta (lo da Angela, nunca en chat)

1. **Clave de Anthropic** — por el flujo seguro (ella la pega como variable
   `ANTHROPIC_API_KEY`). Sin ella la app funciona en modo STUB (respuestas de
   ejemplo); para la prueba real hace falta la clave.
2. **Datos SMTP** — host/usuario/clave de su correo para los avisos a
   motolabaa@gmail.com (o seguir sin SMTP: los avisos solo quedan en el log y
   el registro/pago igual funciona; Angela los ve en su panel).
3. **Cuentas de hosting** — Render, Fly.io o Railway, y Neon: las crea Angela
   con su correo (son gratis; Fly.io y Railway piden tarjeta, Render y Neon no).
4. **Migración de clientes actuales** — solo cuando la nueva versión esté probada
   y Angela lo autorice (por ahora arranca vacía; la versión de Muse sigue en
   vivo como respaldo y no se toca).

## Estado de las pruebas (26-nov-2026)

- Backend y frontend construidos y compilados sin errores; catálogo en vivo
  verificado (732 repuestos); stub de Cheo verificado con 3 síntomas.
- **PENDIENTE:** prueba de punta a punta contra Postgres real (registro → pago →
  confirmación → respuesta de Cheo → vencimiento y bloqueo → borrado 48 h).
  Bloqueada porque la instalación de PostgreSQL en esta VM (`sudo apt-get
  install -y postgresql`) necesitaba una aprobación que caducó sin respuesta.
  Con esa aprobación, el agente de pruebas retoma desde el paso 1.
