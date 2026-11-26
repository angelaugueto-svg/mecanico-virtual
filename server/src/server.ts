import 'dotenv/config';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pool, runMigrations, seedPagoMovil } from './db';
import { router } from './routes';
import { startCleanupInterval } from './cleanup';
import { STUB_MODE } from './cheo';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno (.env). El servidor no puede arrancar.');
    process.exit(1);
  }

  await runMigrations();
  await seedPagoMovil();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', router);

  // Frontend estático (si existe client/dist). Si no existe, la API sigue funcionando.
  const clientDist = join(__dirname, '..', '..', 'client', 'dist');
  if (existsSync(join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
    console.log(`[server] sirviendo frontend desde ${clientDist}`);
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        ok: true,
        service: 'Mecánico Virtual Motolab AA — API',
        stub: STUB_MODE,
        note: 'El frontend (client/dist) aún no está construido.',
      });
    });
    console.log('[server] client/dist no existe todavía; solo API.');
  }

  app.use((err: Error, _req: Request, res: Response) => {
    console.error('[server] error:', err);
    res.status(500).json({ error: 'internal' });
  });

  startCleanupInterval();

  app.listen(PORT, () => {
    console.log(`[server] Mecánico Virtual escuchando en puerto ${PORT}`);
    console.log(`[server] modo Cheo: ${STUB_MODE ? 'STUB (sin ANTHROPIC_API_KEY)' : 'Anthropic API'}`);
  });

  const shutdown = async (): Promise<void> => {
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] no pudo arrancar:', err);
  process.exit(1);
});
