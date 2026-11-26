# Mecánico Virtual Motolab AA — Frontend (standalone)

App de una sola página (HTML/CSS/JS plano, sin framework) para el Mecánico Virtual, fuera de Muse.

## Compilar

```bash
cd client
npm run build   # copia src/ a dist/ (sin dependencias, no hay npm install)
```

El backend sirve los estáticos de `client/dist/` (`index.html`, `styles.css`, `app.js`).
El desarrollo puede hacerse editando `src/` y volviendo a correr `npm run build`.

## Qué hace

- **Registro / inicio:** usuario + teléfono (sin clave, sin nombre). Formato automático de teléfono `0412-1234567`.
- **Paso del pago (congelado):** «Tu registro quedó detenido aquí». Los datos del pago móvil (banco, teléfono, cédula; sin titular) solo se muestran ahí. Formulario de pago con cédula `V-12345678` formateada automáticamente.
- **Chat con Cheo:** 3 opciones en la 1ª pregunta, «¿No te quedó claro? Sigue preguntándole a Cheo» tras cada respuesta, diagnóstico guiado («Ya lo revisé, no es eso», «¡Era eso!», «Explícame más fácil», «¿Cómo lo hago?»), tarjetas de repuestos con código, precio o «Precio a consultar» y botón de WhatsApp (0422-720-1274). El saludo solo aparece cuando el servidor responde `greeting: true` y no lleva bocina.
- **Voz gratis:** cada respuesta trae bocina «Escuchar» con `window.speechSynthesis` del propio dispositivo (sin clave ni servicio pago); prefiere voz en español y de hombre si hay, velocidad 1. Si no hay `speechSynthesis` o no hay voz en español, la bocina se oculta (solo texto).
- **Modo de prueba:** si el servidor responde `stub: true` (o `/api/health` dice `stub: true`), se muestra «Modo de prueba: respuestas de ejemplo, no es Cheo de verdad».
- **Sesión:** token en `localStorage`, revisión de acceso cada minuto (`GET /api/session`).
- **Panel de Angela:** entrada con PIN (se crea si no existe), lista «Clientes» (usuario · teléfono, «Plan desde…» / «Activo hasta…», verde activo / rojo vencido, «Activar» / «Desactivar»), «Pagos por confirmar» («Confirmar pago» / «No llegó», aviso «Tienes N pago(s) nuevo(s) por confirmar»), «Registrar un cliente», datos de pago móvil editables, respaldo CSV y limpieza de 48 h.

## API

Consume exactamente la API de `../SPEC.md` (base `/api`): `register`, `login`, `session`, `request-plan`, `ask`, `history`, `health`, `admin/set-pin`, `admin/login`, `admin/status`, `admin/dashboard`, `admin/decide`, `admin/register-client`, `admin/set-active`, `admin/save-pago-movil`, `admin/export`, `admin/cleanup`.

## Sin verificar en vivo

El frontend no se probó contra el backend real (lo hace otro agente): las llamadas a `/api` siguen el SPEC al pie de la letra, pero falta la prueba de integración.
