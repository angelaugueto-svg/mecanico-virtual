# Mecánico Virtual Motolab AA — standalone (fuera de Muse)

Reconstrucción como aplicación web independiente con su propio enlace público.
**NO tocar la versión actual de Muse ni sus datos.** La nueva app arranca vacía (solo para pruebas).
Repo: `~/workspace/mecanico-virtual-standalone/` — backend en `server/`, frontend en `client/`.

## Stack
- Node 24 + TypeScript. Backend: Express + Drizzle ORM + PostgreSQL.
- Frontend: app de una sola página (HTML/CSS/JS, sin framework pesado; puede ser Vite+React si se prefiere, pero debe compilarse a estáticos servidos por el backend).
- Cheo: Anthropic API (`@anthropic-ai/sdk`), modelo por defecto `claude-haiku-4-5` (barato; sobreescribible por env `ANTHROPIC_MODEL`). Clave por env `ANTHROPIC_API_KEY`. **Sin clave → modo STUB** (ver abajo). Nunca inventar ni pedir la clave en chat.
- Correo: nodemailer SMTP por env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Sin SMTP configurado: registrar el intento en log y seguir (registro/pago igual quedan).
- Catálogo: leído EN VIVO de Google Sheets «Motolab AA - Productos», ID `1qiTU_xBfl25SEGgIs6FTnmlESaD6oFiPDip9W-Od7PA`, pestaña `Sheet1`, columnas A Código, B Descripción, C Compatible con, D Precio, E Estado, F Categoría, G Foto. Vía endpoint público gviz CSV (`https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=Sheet1&headers=1`), caché 5 min. Precio vacío = «Precio a consultar». Si la lectura falla: usar última copia en caché; si no hay, Cheo responde sin repuestos y lo dice.
- Zona horaria: America/Caracas para conteo de días (saludo por día, vencimiento por días calendario).

## Reglas de negocio (firmes, no cambiar)
- Plan único: **$3/mes, preguntas ilimitadas**. Un período = 1 mes calendario desde activación.
- Registro: **usuario + número de teléfono**. Sin clave, sin nombre real, sin recuperación. Usuario único (insensible a mayúsculas), teléfono único (normalizado: solo dígitos, 0412… / 412… / +58… → forma canónica 0412…; si ya está registrado, avisar «Ese número ya está registrado» / «Ese usuario ya lo tiene otra cuenta»).
- Sesión: token Bearer, 30 días en el teléfono. La app revisa el acceso cada minuto.
- Quien se registra y no paga queda **congelado en el paso del pago** («Tu registro quedó detenido aquí»); `ask` rechaza en servidor. Al activarlo, el acceso aparece en menos de un minuto.
- Pago: pago móvil manual. Datos del negocio (semilla por defecto, ver «Datos semilla»): solo se muestran en el paso del pago, nunca en la pantalla inicial. El cliente carga: nombre de quien paga, cédula, monto en Bs, referencia, banco de origen. Estado «Pago en revisión».
- Angela confirma en el panel: «Confirmar pago» (activa 1 mes; reactiva vencidos) o «No llegó» (rechaza). «Registrar un cliente» (usuario, teléfono, banco, referencia → «Registrar y activar», 1 mes). «Activar» / «Desactivar» (desactivar = vencimiento ahora, acceso cortado al momento).
- **Referencias comparadas sin mayúsculas/minúsculas.** Una referencia ya activa no suma otro mes. Registrar a alguien ya activo NO suma mes: guarda banco y referencia sobre el plan vigente y el panel avisa «ya estaba activo hasta el…: no se sumó otro mes». Confirmar un pago cuyo plan ya empezó se cierra como revisado sin apilar otro mes.
- Correos a **motolabaa@gmail.com**: al registrarse (usuario y teléfono) y al cargar pago (todos los datos). Asunto pago: «Nuevo registro con pago por revisar — Mecánico Virtual (1 mes, $3)». Si el correo falla, el registro/pago igual queda.
- Borrado automático: consultas se borran a las 48 h; registrados sin pagar se borran a las 48 h (limpieza cada 6 h, también al abrir el panel y al pedir historial/preguntar). Quien pagó alguna vez conserva su tarjeta aunque venció; un pago en revisión protege la tarjeta.
- Días restantes: días calendario en America/Caracas desde activación. Al vencer, Cheo no acepta preguntas («vencido»).
- Panel: «Plan desde el…» / «Activo hasta el…» (verde activo, rojo vencido); lista «Clientes» por cuenta (usuario · teléfono, sin nombre); «Pagos por confirmar» con todos los datos del pago; aviso «Tienes N pagos nuevos…». Panel protegido por PIN que Angela crea (hash bcrypt; nunca adivinar ni cambiar sin ella).
- **REGLA: en lo que ven los clientes no va «Angela», va Motolab AA.** Paso 3 dice solo «Confirma tu pago y pregunta lo que quieras». En la app no sale dónde está la tienda.
- Formato automático: cédula V-12345678, teléfono 0412-1234567.
- Sin pasarela de pago. Sin tienda (Play/App Store) en esta fase.

## Cheo (reglas firmes)
- Saludo: «¡Hola! Soy Cheo, el mecánico. ¿En qué te puedo ayudar?» — **solo texto, sin bocina**. Solo en la **primera pregunta de cada día** (marca propia por cliente y día, p. ej. `greeting_date` en la cuenta; NO contar preguntas del día). Las demás respuestas de ese día van directo a la respuesta; al día siguiente se vuelve a presentar.
- **Da la respuesta y se calla**: sin invitar a seguir preguntando, sin relleno. Si el cliente dice que ya solucionó, cierra con una frase corta y seca (sin «oh, qué bueno», sin despedidas).
- Respuestas cortas y directas: resumen 1–2 frases, máx. 3 causas, 5 pasos cortos, 3 repuestos. Educado y respetuoso; responde solo lo que sabe con seguridad, sin inventar; si no sabe, lo dice y recomienda mecánico presencial, el taller o WhatsApp (0422-720-1274). Razona desde el síntoma. No dice «pana» ni «el mecánico de Motolab AA».
- Repuestos: **solo del catálogo real** (código, precio o «Precio a consultar», botón WhatsApp). Nunca inventar precios, existencias ni compatibilidad. Pregunta marca, modelo, año y cilindrada antes de afirmar compatibilidad.
- Interacción: 1ª pregunta ofrece 3 opciones («No enciende», «Hace un ruido raro», «Se apaga o pierde fuerza»); tras cada respuesta, en pantalla (NO en la voz): «¿No te quedó claro? Sigue preguntándole a Cheo» con 3 opciones.
- **Diagnóstico guiado**: una causa por vez, la más probable primero; «Ya lo revisé, no es eso» pasa a la siguiente sin repetir descartadas; también «¡Era eso!» y «Explícame más fácil»; si descarta las 3, recomienda mecánico presencial, taller o WhatsApp.
- **«¿Cómo lo hago?»**: debajo de cada respuesta explica solo el paso a paso de la revisión nombrada; las respuestas normales NO llevan paso a paso.
- **Voz: GRATIS o nada.** Audio por Web Speech API del propio dispositivo (`speechSynthesis`, sin clave ni servicio de pago). Cada respuesta trae bocina «Escuchar» y texto visible. Si `speechSynthesis` no existe o no hay voz en español, se oculta la bocina (solo texto). El saludo NO lleva bocina. Preferir voz en español (es-VE, es-ES, es-MX, es-US) y, si hay varias, una de hombre; velocidad ~1. Sin voz pagada jamás (la voz Helio es de Muse y no se puede usar fuera).

## Modo STUB (sin ANTHROPIC_API_KEY)
- El backend debe funcionar completo sin la clave. `ask` en modo stub: responde con causas deterministas por palabras del síntoma (p. ej. no enciende → bujía/batería/carburador según el texto) usando solo repuestos del catálogo cargado, con el mismo formato de respuesta (resumen, causas, pasos, repuestos) y una marca clara `stub: true` en la respuesta y en el log. El front muestra «Modo de prueba: respuestas de ejemplo, no es Cheo de verdad» mientras el stub esté activo. Documentar en README qué falta para la prueba real (la clave).

## Datos semilla (NO inventar; vienen de la app actual)
- Pago móvil del negocio: banco `0172 - Bancamiga`, teléfono `0426-5136094`, cédula `V-14035968`, titular VACÍO (por regla de Angela el nombre NO se muestra: los clientes ven solo teléfono, cédula y banco).
- WhatsApp de la tienda: `0422-720-1274` (wa.me/584227201274). Instagram `@motolabaa`.
- Colores: negro, naranja, blanco. Título «Motolab AA / Mecánico Virtual», eslogan «Tu moto, en buenas manos».

## API (contrato entre front y back — seguirlo exacto)
Base `/api`. Auth cliente: `Authorization: Bearer <token>`. Auth panel: `Authorization: Bearer <admin-token>` (se obtiene con el PIN) o header `X-Admin-Pin` solo para login/crear PIN.
- `POST /api/register` {username, phone} → 200 {token, client:{username, phone}, state:'none'|'pending'|'active'|'expired', planEndsAt} | 409 si usuario/teléfono ya existe.
- `POST /api/login` {username, phone} → 200 como register (sin crear). 404 si no existe; la comparación de usuario no distingue mayúsculas; el teléfono se normaliza igual que en registro.
- `GET /api/session` → {client, state, plan:{startsAt, endsAt, daysLeft}, pagoMovil?: {bank, phone, cedula} (solo cuando state es 'none' o 'pending', es decir, en el paso del pago)}.
- `POST /api/request-plan` {payerName, cedula, amountBs, reference, bank} → 200 {payment:{id, status:'pending'}}. Valida los 5 campos. Referencia normalizada a mayúsculas para comparar.
- `POST /api/ask` {message, mode?: 'question'|'not-that'|'solved'|'explain-easier'|'how-to', causeIndex?: number, brand?, model?, year?, cc?} → 200 {greeting: boolean, answer: string, causes?: string[], parts?: [{code, description, price|null, compatible}], stub: boolean, state}. Si state no es 'active' → 403 {error:'not-active'}. Si mode 'solved' → respuesta de cierre corta y seca.
- `GET /api/history` → {consultations: [{id, question, answer, createdAt}]} (solo las del cliente, 48 h).
- `POST /api/admin/set-pin` {pin} → solo si no hay PIN aún. `POST /api/admin/login` {pin} → {adminToken}.
- `GET /api/admin/status` → {pinSet: boolean, pagoMovil: {bank, phone, cedula}, pendingPayments: number}.
- `GET /api/admin/dashboard` → {clients: [{id, username, phone, state, planStartsAt, planEndsAt, consultationsToday, consultations48h, bank, reference}], payments: [{id, clientUsername, clientPhone, payerName, cedula, amountBs, reference, bank, createdAt}]}.
- `POST /api/admin/decide` {paymentId, decision: 'confirm'|'reject'} → confirm activa 1 mes (o reactiva vencido); si el plan ya estaba activo, cierra como revisado sin sumar mes.
- `POST /api/admin/register-client` {username, phone, bank, reference} → crea y activa 1 mes; si ya estaba activo, no suma mes y avisa.
- `POST /api/admin/set-active` {clientId, active: boolean} → desactivar pone endsAt=ahora.
- `POST /api/admin/save-pago-movil` {bank, phone, cedula} → guarda (titular siempre vacío).
- `GET /api/admin/export` → CSV de clientes y períodos (respaldo antes de cancelar el servidor).
- `GET /api/health` → {ok: true, stub: boolean, smtp: boolean}.

## Tablas (Postgres)
- `clients` (id uuid, username citext unique, phone text unique, created_at, greeting_date date NULL)
- `sessions` (token text pk, client_id fk, expires_at)
- `access_periods` (id, client_id fk, starts_at, ends_at, price_usd int=3, status, bank, reference_norm text)
- `payments` (id, client_id fk, payer_name, cedula, amount_bs numeric, reference, reference_norm, bank, status pending/confirmed/rejected, created_at)
- `consultations` (id, client_id fk, question, answer, created_at)
- `settings` (key text pk, value text) — claves: `pago_movil_bank`, `pago_movil_phone`, `pago_movil_cedula`, `admin_pin_hash`.
- Migraciones numeradas en `server/drizzle/` o `server/migrations/`. Limpieza: borrar consultas >48 h y clientes sin pago y sin período >48 h, cada 6 h (setInterval en el servidor + endpoint manual `POST /api/admin/cleanup`).

## Variables de entorno (`.env.example` con todo, sin valores reales)
`DATABASE_URL`, `ANTHROPIC_API_KEY` (opcional → stub), `ANTHROPIC_MODEL` (defecto claude-haiku-4-5), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PORT` (defecto 3000), `SESSION_DAYS`=30, `CATALOG_SHEET_ID` (defecto el de arriba).

## Despliegue (lo prepara el agente de despliegue, no este SPEC)
- Render gratis para probar (web service gratis se duerme a los 15 min; Postgres gratis de Render vence a los 30 días — documentarlo) o Fly.io gratis; DB Postgres. `render.yaml` + `Dockerfile` + `fly.toml` + `DEPLOY.md` con pasos exactos, costos y cómo cancelar cada pieza. Sin cuentas pagas ahora.
