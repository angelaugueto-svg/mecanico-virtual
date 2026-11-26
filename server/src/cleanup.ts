import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { accessPeriods, clients, consultations, payments, sessions } from './schema';

/**
 * Limpieza (SPEC):
 * - Borra consultas de más de 48 h.
 * - Borra clientes registrados hace más de 48 h que nunca pagaron
 *   (sin períodos y sin ningún pago). Un pago en revisión protege la tarjeta;
 *   quien pagó alguna vez conserva su tarjeta aunque venció.
 */
export async function runCleanup(): Promise<{ consultationsDeleted: number; clientsDeleted: number }> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const deletedConsultations = await db
    .delete(consultations)
    .where(lt(consultations.createdAt, cutoff))
    .returning({ id: consultations.id });

  // Clientes viejos sin períodos y sin pagos.
  const stale = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        lt(clients.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM ${accessPeriods} WHERE ${accessPeriods.clientId} = ${clients.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${payments} WHERE ${payments.clientId} = ${clients.id})`,
      ),
    );
  let clientsDeleted = 0;
  for (const c of stale) {
    await db.delete(sessions).where(eq(sessions.clientId, c.id));
    await db.delete(clients).where(eq(clients.id, c.id));
    clientsDeleted++;
  }

  const result = {
    consultationsDeleted: deletedConsultations.length,
    clientsDeleted,
  };
  if (result.consultationsDeleted || result.clientsDeleted) {
    console.log('[cleanup]', result);
  }
  return result;
}

/** Limpieza ligera al abrir el panel / pedir historial / preguntar: solo consultas viejas. */
export async function cleanupConsultationsOnly(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await db.delete(consultations).where(lt(consultations.createdAt, cutoff));
}

export function startCleanupInterval(): NodeJS.Timeout {
  return setInterval(
    () => {
      runCleanup().catch((err) => console.error('[cleanup] error:', err));
    },
    6 * 60 * 60 * 1000,
  );
}
