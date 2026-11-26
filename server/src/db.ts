import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render/Fly Postgres exigen SSL; en local no se usa.
  ssl:
    process.env.DATABASE_URL?.includes('render.com') ||
    process.env.DATABASE_URL?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export async function runMigrations(): Promise<void> {
  const dir = join(__dirname, '..', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS applied_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM applied_migrations WHERE name = $1',
        [file],
      );
      if (rows.length > 0) continue;
      const sqlText = readFileSync(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query(
          'INSERT INTO applied_migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

/** Datos semilla del pago móvil (SPEC — no inventar). Titular siempre vacío. */
export async function seedPagoMovil(): Promise<void> {
  const defaults: Record<string, string> = {
    pago_movil_bank: process.env.SEED_PAGO_MOVIL_BANK ?? '0172 - Bancamiga',
    pago_movil_phone: process.env.SEED_PAGO_MOVIL_PHONE ?? '0426-5136094',
    pago_movil_cedula: process.env.SEED_PAGO_MOVIL_CEDULA ?? 'V-14035968',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}
