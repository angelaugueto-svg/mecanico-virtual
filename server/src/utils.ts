/** Utilidades de fechas (America/Caracas), teléfonos y cédulas. */

export const CARACAS_TZ = 'America/Caracas';

/** Fecha YYYY-MM-DD de un instante en America/Caracas. */
export function caracasDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Días calendario (America/Caracas) desde hoy hasta `endsAt`. 0 si vence hoy. */
export function daysLeft(endsAt: Date | string | null, now = new Date()): number {
  if (!endsAt) return 0;
  const end = new Date(endsAt);
  const a = caracasDateString(now);
  const b = caracasDateString(end);
  const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Suma 1 mes calendario a una fecha (con tope al último día del mes destino). */
export function addOneMonth(d: Date): Date {
  const out = new Date(d);
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

/**
 * Normaliza un teléfono venezolano a la forma canónica 0412XXXXXXX.
 * Acepta 0412…, 412…, +58 412…, 58412… y con espacios/guiones.
 * Devuelve null si no queda un número válido (11 dígitos empezando por 04).
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('58')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('4')) digits = '0' + digits;
  if (digits.length !== 11 || !digits.startsWith('04')) return null;
  return digits;
}

/** Formato de pantalla: 0412-1234567. */
export function formatPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 4)}-${phone.slice(4)}` : phone;
}

/** Normaliza una cédula a V-12345678 (mayúsculas, con guion). */
export function normalizeCedula(raw: string | undefined | null): string {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(s)) return `V-${s}`;
  if (/^V\d+$/.test(s)) return `V-${s.slice(1)}`;
  if (/^[VEJPG]-\d+$/.test(s)) return s;
  return s;
}

/** Referencia normalizada para comparar sin mayúsculas/minúsculas ni espacios. */
export function normalizeReference(raw: string | undefined | null): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Estado del cliente según su período vigente y sus pagos. */
export type ClientState = 'none' | 'pending' | 'active' | 'expired';

export function computeState(
  activePeriod: { endsAt: Date | string } | null | undefined,
  expiredPeriod: { endsAt: Date | string } | null | undefined,
  hasPendingPayment: boolean,
): ClientState {
  if (activePeriod) return 'active';
  if (hasPendingPayment) return 'pending';
  if (expiredPeriod) return 'expired';
  return 'none';
}
