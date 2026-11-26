import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';
import { db } from './db';
import { accessPeriods, clients, consultations, payments, sessions, settings } from './schema';
import {
  addOneMonth,
  caracasDateString,
  computeState,
  daysLeft,
  formatPhone,
  normalizeCedula,
  normalizePhone,
  normalizeReference,
  type ClientState,
} from './utils';
import { askCheo, GREETING, STUB_MODE } from './cheo';
import { fetchCatalog } from './catalog';
import { sendStoreMail, smtpConfigured, STORE_EMAIL } from './mailer';
import { cleanupConsultationsOnly, runCleanup } from './cleanup';

export const router = express.Router();

const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);

/* ---------------- helpers ---------------- */

interface AuthedRequest extends Request {
  client?: typeof clients.$inferSelect;
}

async function getPagoMovil(): Promise<{ bank: string; phone: string; cedula: string }> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    bank: map.get('pago_movil_bank') ?? '0172 - Bancamiga',
    phone: map.get('pago_movil_phone') ?? '0426-5136094',
    cedula: map.get('pago_movil_cedula') ?? 'V-14035968',
  };
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

interface PlanInfo {
  startsAt: Date | null;
  endsAt: Date | null;
  state: ClientState;
}

async function getPlan(clientId: string): Promise<PlanInfo> {
  const now = new Date();
  const periods = await db
    .select()
    .from(accessPeriods)
    .where(eq(accessPeriods.clientId, clientId))
    .orderBy(desc(accessPeriods.endsAt))
    .limit(1);
  const latest = periods[0];
  const active =
    latest && new Date(latest.endsAt) > now ? latest : null;
  const pending = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.clientId, clientId), eq(payments.status, 'pending')))
    .limit(1);
  return {
    startsAt: latest ? new Date(latest.startsAt) : null,
    endsAt: latest ? new Date(latest.endsAt) : null,
    state: computeState(active, latest ?? null, pending.length > 0),
  };
}

async function createSession(clientId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, clientId, expiresAt });
  return token;
}

function clientView(c: typeof clients.$inferSelect, plan: PlanInfo) {
  return {
    username: c.username,
    phone: formatPhone(c.phone),
    state: plan.state,
    planStartsAt: plan.startsAt?.toISOString() ?? null,
    planEndsAt: plan.endsAt?.toISOString() ?? null,
    daysLeft: plan.state === 'active' ? daysLeft(plan.endsAt) : 0,
  };
}

async function authClient(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (rows.length === 0) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, rows[0].clientId));
  if (!client) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.client = client;
  next();
}

/* ---------------- admin auth (token en memoria) ---------------- */

const adminTokens = new Map<string, number>(); // token -> expira (ms)

function issueAdminToken(): string {
  const token = randomBytes(32).toString('hex');
  adminTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
  return token;
}

async function authAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const exp = token ? adminTokens.get(token) : undefined;
  if (!exp || exp < Date.now()) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

async function getPinHash(): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, 'admin_pin_hash'));
  return rows[0]?.value ?? null;
}

/* ---------------- health ---------------- */

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, stub: STUB_MODE, smtp: smtpConfigured() });
});

/* ---------------- cliente: registro / login / sesión ---------------- */

router.post('/register', async (req: Request, res: Response) => {
  const username = String(req.body?.username ?? '').trim();
  const phone = normalizePhone(req.body?.phone);
  if (!username || username.length < 3 || username.length > 40 || !/^[A-Za-z0-9_.\-]+$/.test(username)) {
    res.status(400).json({ error: 'invalid-username' });
    return;
  }
  if (!phone) {
    res.status(400).json({ error: 'invalid-phone' });
    return;
  }
  const byUser = await db
    .select()
    .from(clients)
    .where(sql`lower(${clients.username}) = lower(${username})`)
    .limit(1);
  if (byUser.length > 0) {
    res.status(409).json({ error: 'username-taken', message: 'Ese usuario ya lo tiene otra cuenta' });
    return;
  }
  const byPhone = await db.select().from(clients).where(eq(clients.phone, phone)).limit(1);
  if (byPhone.length > 0) {
    res.status(409).json({ error: 'phone-taken', message: 'Ese número ya está registrado' });
    return;
  }
  const [client] = await db
    .insert(clients)
    .values({ username, phone })
    .returning();
  const token = await createSession(client.id);
  const plan = await getPlan(client.id);
  await sendStoreMail(
    'Nuevo registro — Mecánico Virtual',
    `Se registró un nuevo cliente en el Mecánico Virtual.\n\nUsuario: ${username}\nTeléfono: ${formatPhone(phone)}\n\nSin pago todavía: quedó en el paso del pago.`,
  );
  res.json({
    token,
    client: { username: client.username, phone: formatPhone(client.phone) },
    state: plan.state,
    planEndsAt: plan.endsAt?.toISOString() ?? null,
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const username = String(req.body?.username ?? '').trim();
  const phone = normalizePhone(req.body?.phone);
  if (!username || !phone) {
    res.status(400).json({ error: 'invalid-credentials' });
    return;
  }
  const found = await db
    .select()
    .from(clients)
    .where(
      and(
        sql`lower(${clients.username}) = lower(${username})`,
        eq(clients.phone, phone),
      ),
    )
    .limit(1);
  if (found.length === 0) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  const client = found[0];
  const token = await createSession(client.id);
  const plan = await getPlan(client.id);
  res.json({
    token,
    client: { username: client.username, phone: formatPhone(client.phone) },
    state: plan.state,
    planEndsAt: plan.endsAt?.toISOString() ?? null,
  });
});

router.get('/session', authClient, async (req: AuthedRequest, res: Response) => {
  const client = req.client!;
  const plan = await getPlan(client.id);
  const out: Record<string, unknown> = {
    client: { username: client.username, phone: formatPhone(client.phone) },
    state: plan.state,
    plan: {
      startsAt: plan.startsAt?.toISOString() ?? null,
      endsAt: plan.endsAt?.toISOString() ?? null,
      daysLeft: plan.state === 'active' ? daysLeft(plan.endsAt) : 0,
    },
  };
  if (plan.state === 'none' || plan.state === 'pending') {
    out.pagoMovil = await getPagoMovil();
  }
  res.json(out);
});

/* ---------------- pago ---------------- */

router.post('/request-plan', authClient, async (req: AuthedRequest, res: Response) => {
  const client = req.client!;
  const payerName = String(req.body?.payerName ?? '').trim();
  const cedula = normalizeCedula(req.body?.cedula);
  const amountBs = Number(req.body?.amountBs);
  const reference = String(req.body?.reference ?? '').trim();
  const bank = String(req.body?.bank ?? '').trim();
  if (!payerName || !cedula || !Number.isFinite(amountBs) || amountBs <= 0 || !reference || !bank) {
    res.status(400).json({ error: 'invalid-payment' });
    return;
  }
  const [payment] = await db
    .insert(payments)
    .values({
      clientId: client.id,
      payerName,
      cedula,
      amountBs: amountBs.toFixed(2),
      reference,
      referenceNorm: normalizeReference(reference),
      bank,
      status: 'pending',
    })
    .returning();
  await sendStoreMail(
    'Nuevo registro con pago por revisar — Mecánico Virtual (1 mes, $3)',
    [
      'Un cliente cargó un pago por revisar en el Mecánico Virtual.',
      '',
      `Usuario: ${client.username}`,
      `Teléfono: ${formatPhone(client.phone)}`,
      `Nombre de quien paga: ${payerName}`,
      `Cédula: ${cedula}`,
      `Monto: ${amountBs} Bs`,
      `Referencia: ${reference}`,
      `Banco de origen: ${bank}`,
      '',
      'Confirmarlo en el panel activa 1 mes ($3).',
    ].join('\n'),
  );
  res.json({ payment: { id: payment.id, status: 'pending' } });
});

/* ---------------- Cheo: preguntar / historial ---------------- */

router.post('/ask', authClient, async (req: AuthedRequest, res: Response) => {
  const client = req.client!;
  await runCleanup().catch((e) => console.error('[ask] cleanup:', e));
  const plan = await getPlan(client.id);
  if (plan.state !== 'active') {
    res.status(403).json({ error: 'not-active', state: plan.state });
    return;
  }
  const message = String(req.body?.message ?? '').trim();
  const mode = (req.body?.mode ?? 'question') as 'question' | 'not-that' | 'solved' | 'explain-easier' | 'how-to';
  if (!message) {
    res.status(400).json({ error: 'empty-message' });
    return;
  }
  const vehicle = {
    brand: req.body?.brand ? String(req.body.brand) : undefined,
    model: req.body?.model ? String(req.body.model) : undefined,
    year: req.body?.year ? String(req.body.year) : undefined,
    cc: req.body?.cc ? String(req.body.cc) : undefined,
  };

  // Cheo no responde sin los datos de la moto (los 4 datos).
  // Si faltan, no se consulta a Cheo ni se guarda la pregunta: se piden los datos.
  if (mode === 'question' && (!vehicle.brand || !vehicle.model || !vehicle.year || !vehicle.cc)) {
    res.json({
      greeting: false,
      answer: 'Para ayudarte bien necesito saber de tu moto: marca, modelo, año y cilindrada. Escríbelos arriba y vuelve a preguntarme.',
      causes: [],
      parts: [],
      stub: false,
    });
    return;
  }

  // Saludo: solo en la primera pregunta de cada día (marca propia por día, no conteo).
  let greeting = false;
  if (mode === 'question') {
    const today = caracasDateString();
    if (client.greetingDate !== today) {
      await db.update(clients).set({ greetingDate: today }).where(eq(clients.id, client.id));
      greeting = true;
    }
  }

  const historyRows = await db
    .select()
    .from(consultations)
    .where(eq(consultations.clientId, client.id))
    .orderBy(desc(consultations.createdAt))
    .limit(4);
  const history = historyRows
    .reverse()
    .map((h) => ({ question: h.question, answer: h.answer }));

  const result = await askCheo(message, mode, vehicle, history);
  const answer = greeting ? `${GREETING}\n${result.answer}` : result.answer;

  await db.insert(consultations).values({
    clientId: client.id,
    question: message,
    answer,
  });
  console.log(
    `[ask] ${client.username} mode=${mode} stub=${result.stub} greeting=${greeting}`,
  );
  res.json({
    greeting,
    answer,
    causes: result.causes,
    parts: result.parts.map((p) => ({
      code: p.code,
      description: p.description,
      price: p.price,
      compatible: p.compatible,
    })),
    stub: result.stub,
    state: plan.state,
  });
});

router.get('/history', authClient, async (req: AuthedRequest, res: Response) => {
  await cleanupConsultationsOnly();
  const rows = await db
    .select()
    .from(consultations)
    .where(eq(consultations.clientId, req.client!.id))
    .orderBy(desc(consultations.createdAt))
    .limit(100);
  res.json({
    consultations: rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

/* ---------------- admin ---------------- */

router.post('/admin/set-pin', async (req: Request, res: Response) => {
  const existing = await getPinHash();
  if (existing) {
    res.status(403).json({ error: 'pin-already-set' });
    return;
  }
  const pin = String(req.body?.pin ?? '').trim();
  if (pin.length < 4 || pin.length > 12 || !/^\d+$/.test(pin)) {
    res.status(400).json({ error: 'invalid-pin' });
    return;
  }
  const hash = await bcrypt.hash(pin, 10);
  await setSetting('admin_pin_hash', hash);
  res.json({ adminToken: issueAdminToken() });
});

router.post('/admin/login', async (req: Request, res: Response) => {
  const pin = String(req.body?.pin ?? '').trim();
  const hash = await getPinHash();
  if (!hash) {
    res.status(404).json({ error: 'pin-not-set' });
    return;
  }
  const ok = await bcrypt.compare(pin, hash);
  if (!ok) {
    res.status(401).json({ error: 'wrong-pin' });
    return;
  }
  res.json({ adminToken: issueAdminToken() });
});

router.get('/admin/status', async (req: Request, res: Response) => {
  const pinSet = (await getPinHash()) !== null;
  // Sin sesión de admin solo se dice si ya hay PIN (para mostrar el
  // formulario correcto: crear PIN o entrar con el PIN). Los datos del
  // panel solo se devuelven con una sesión válida.
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const exp = token ? adminTokens.get(token) : undefined;
  const authed = !!exp && exp >= Date.now();
  if (!authed) {
    res.json({ pinSet, pendingPayments: 0, stub: STUB_MODE });
    return;
  }
  const pending = await db
    .select({ n: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.status, 'pending'));
  res.json({
    pinSet,
    pagoMovil: await getPagoMovil(),
    pendingPayments: Number(pending[0]?.n ?? 0),
    stub: STUB_MODE,
  });
});

router.get('/admin/dashboard', authAdmin, async (_req: Request, res: Response) => {
  await runCleanup().catch((e) => console.error('[dashboard] cleanup:', e));
  const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
  const allPeriods = await db
    .select()
    .from(accessPeriods)
    .orderBy(desc(accessPeriods.endsAt));
  const latestByClient = new Map<string, (typeof accessPeriods.$inferSelect)[]>();
  for (const p of allPeriods) {
    if (!latestByClient.has(p.clientId)) latestByClient.set(p.clientId, [p]);
  }
  const pendingPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.status, 'pending'))
    .orderBy(desc(payments.createdAt));
  const pendingByClient = new Set(pendingPayments.map((p) => p.clientId));

  // Consultas de hoy (America/Caracas) y de las últimas 48 h, por cliente.
  const todayCaracas = caracasDateString();
  const startOfTodayUtc = new Date(`${todayCaracas}T04:00:00Z`); // Caracas = UTC-4
  const cutoff48 = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const countsToday = await db
    .select({ clientId: consultations.clientId, n: sql<number>`count(*)` })
    .from(consultations)
    .where(gt(consultations.createdAt, startOfTodayUtc))
    .groupBy(consultations.clientId);
  const counts48 = await db
    .select({ clientId: consultations.clientId, n: sql<number>`count(*)` })
    .from(consultations)
    .where(gt(consultations.createdAt, cutoff48))
    .groupBy(consultations.clientId);
  const todayMap = new Map(countsToday.map((r) => [r.clientId, Number(r.n)]));
  const map48 = new Map(counts48.map((r) => [r.clientId, Number(r.n)]));

  const now = new Date();
  const clientsOut = await Promise.all(
    allClients.map(async (c) => {
      const latest = latestByClient.get(c.id)?.[0] ?? null;
      const active = latest && new Date(latest.endsAt) > now ? latest : null;
      const state = computeState(active, latest, pendingByClient.has(c.id));
      return {
        id: c.id,
        username: c.username,
        phone: formatPhone(c.phone),
        state,
        planStartsAt: latest?.startsAt.toISOString() ?? null,
        planEndsAt: latest?.endsAt.toISOString() ?? null,
        daysLeft: state === 'active' ? daysLeft(latest!.endsAt) : 0,
        consultationsToday: todayMap.get(c.id) ?? 0,
        consultations48h: map48.get(c.id) ?? 0,
        bank: latest?.bank ?? null,
        reference: latest?.referenceNorm ?? null,
      };
    }),
  );

  const clientById = new Map(allClients.map((c) => [c.id, c]));
  res.json({
    clients: clientsOut,
    payments: pendingPayments.map((p) => ({
      id: p.id,
      clientUsername: clientById.get(p.clientId)?.username ?? '',
      clientPhone: formatPhone(clientById.get(p.clientId)?.phone ?? ''),
      payerName: p.payerName,
      cedula: p.cedula,
      amountBs: Number(p.amountBs),
      reference: p.reference,
      bank: p.bank,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

router.post('/admin/decide', authAdmin, async (req: Request, res: Response) => {
  const paymentId = String(req.body?.paymentId ?? '');
  const decision = req.body?.decision;
  if (!paymentId || (decision !== 'confirm' && decision !== 'reject')) {
    res.status(400).json({ error: 'invalid-decision' });
    return;
  }
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) {
    res.status(404).json({ error: 'payment-not-found' });
    return;
  }
  if (payment.status !== 'pending') {
    res.status(409).json({ error: 'already-decided', status: payment.status });
    return;
  }
  if (decision === 'reject') {
    await db.update(payments).set({ status: 'rejected' }).where(eq(payments.id, paymentId));
    res.json({ ok: true, decision: 'reject' });
    return;
  }
  // Confirmar: si el plan ya está activo, se cierra como revisado SIN sumar otro mes.
  const plan = await getPlan(payment.clientId);
  if (plan.state === 'active') {
    await db.update(payments).set({ status: 'confirmed' }).where(eq(payments.id, paymentId));
    res.json({
      ok: true,
      decision: 'confirm',
      addedMonth: false,
      message: `El plan ya estaba activo hasta el ${plan.endsAt?.toISOString().slice(0, 10)}: no se sumó otro mes.`,
      planEndsAt: plan.endsAt?.toISOString() ?? null,
    });
    return;
  }
  const startsAt = new Date();
  const endsAt = addOneMonth(startsAt);
  await db.insert(accessPeriods).values({
    clientId: payment.clientId,
    startsAt,
    endsAt,
    priceUsd: 3,
    status: 'active',
    bank: payment.bank,
    referenceNorm: payment.referenceNorm,
  });
  await db.update(payments).set({ status: 'confirmed' }).where(eq(payments.id, paymentId));
  res.json({ ok: true, decision: 'confirm', addedMonth: true, planEndsAt: endsAt.toISOString() });
});

router.post('/admin/register-client', authAdmin, async (req: Request, res: Response) => {
  const username = String(req.body?.username ?? '').trim();
  const phone = normalizePhone(req.body?.phone);
  const bank = String(req.body?.bank ?? '').trim();
  const reference = String(req.body?.reference ?? '').trim();
  if (!username || !phone) {
    res.status(400).json({ error: 'invalid-client' });
    return;
  }
  let [client] = await db
    .select()
    .from(clients)
    .where(sql`lower(${clients.username}) = lower(${username})`)
    .limit(1);
  if (!client) {
    const byPhone = await db.select().from(clients).where(eq(clients.phone, phone)).limit(1);
    if (byPhone.length > 0) {
      res.status(409).json({ error: 'phone-taken', message: 'Ese número ya está registrado' });
      return;
    }
    [client] = await db.insert(clients).values({ username, phone }).returning();
  }
  const plan = await getPlan(client.id);
  if (plan.state === 'active') {
    // Ya activo: NO suma mes; guarda banco y referencia sobre el plan vigente.
    const latest = await db
      .select()
      .from(accessPeriods)
      .where(eq(accessPeriods.clientId, client.id))
      .orderBy(desc(accessPeriods.endsAt))
      .limit(1);
    if (latest[0]) {
      await db
        .update(accessPeriods)
        .set({ bank: bank || latest[0].bank, referenceNorm: normalizeReference(reference) || latest[0].referenceNorm })
        .where(eq(accessPeriods.id, latest[0].id));
    }
    res.json({
      ok: true,
      alreadyActive: true,
      planEndsAt: plan.endsAt?.toISOString() ?? null,
      message: `Ya estaba activo hasta el ${plan.endsAt?.toISOString().slice(0, 10)}: no se sumó otro mes.`,
    });
    return;
  }
  const startsAt = new Date();
  const endsAt = addOneMonth(startsAt);
  await db.insert(accessPeriods).values({
    clientId: client.id,
    startsAt,
    endsAt,
    priceUsd: 3,
    status: 'active',
    bank: bank || null,
    referenceNorm: normalizeReference(reference) || null,
  });
  res.json({
    ok: true,
    alreadyActive: false,
    client: { username: client.username, phone: formatPhone(client.phone) },
    planEndsAt: endsAt.toISOString(),
  });
});

router.post('/admin/set-active', authAdmin, async (req: Request, res: Response) => {
  const clientId = String(req.body?.clientId ?? '');
  const active = req.body?.active === true;
  if (!clientId) {
    res.status(400).json({ error: 'invalid-client' });
    return;
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  const plan = await getPlan(clientId);
  if (active) {
    if (plan.state === 'active') {
      res.json({ ok: true, active: true, planEndsAt: plan.endsAt?.toISOString() ?? null });
      return;
    }
    const startsAt = new Date();
    const endsAt = addOneMonth(startsAt);
    await db.insert(accessPeriods).values({
      clientId,
      startsAt,
      endsAt,
      priceUsd: 3,
      status: 'active',
    });
    res.json({ ok: true, active: true, planEndsAt: endsAt.toISOString() });
    return;
  }
  // Desactivar: vencimiento ahora, acceso cortado al momento.
  const latest = await db
    .select()
    .from(accessPeriods)
    .where(eq(accessPeriods.clientId, clientId))
    .orderBy(desc(accessPeriods.endsAt))
    .limit(1);
  if (latest[0] && new Date(latest[0].endsAt) > new Date()) {
    await db
      .update(accessPeriods)
      .set({ endsAt: new Date(), status: 'expired' })
      .where(eq(accessPeriods.id, latest[0].id));
  }
  res.json({ ok: true, active: false, planEndsAt: new Date().toISOString() });
});

router.post('/admin/save-pago-movil', authAdmin, async (req: Request, res: Response) => {
  const bank = String(req.body?.bank ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim();
  const cedula = normalizeCedula(req.body?.cedula);
  if (!bank || !phone || !cedula) {
    res.status(400).json({ error: 'invalid-pago-movil' });
    return;
  }
  await setSetting('pago_movil_bank', bank);
  await setSetting('pago_movil_phone', phone);
  await setSetting('pago_movil_cedula', cedula);
  // Titular siempre vacío por regla de Angela: nunca se guarda ni se muestra.
  res.json({ ok: true, pagoMovil: { bank, phone, cedula } });
});

router.get('/admin/export', authAdmin, async (_req: Request, res: Response) => {
  const allClients = await db.select().from(clients).orderBy(clients.createdAt);
  const allPeriods = await db
    .select()
    .from(accessPeriods)
    .orderBy(accessPeriods.startsAt);
  const periodsByClient = new Map<string, typeof allPeriods>();
  for (const p of allPeriods) {
    const arr = periodsByClient.get(p.clientId) ?? [];
    arr.push(p);
    periodsByClient.set(p.clientId, arr);
  }
  const esc = (v: string | null | undefined): string => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    'username,phone,state,plan_starts_at,plan_ends_at,bank,reference,created_at',
  ];
  for (const c of allClients) {
    const plan = await getPlan(c.id);
    const periods = periodsByClient.get(c.id) ?? [];
    const latest = periods[periods.length - 1];
    lines.push(
      [
        esc(c.username),
        esc(formatPhone(c.phone)),
        esc(plan.state),
        esc(plan.startsAt?.toISOString() ?? ''),
        esc(plan.endsAt?.toISOString() ?? ''),
        esc(latest?.bank ?? ''),
        esc(latest?.referenceNorm ?? ''),
        esc(c.createdAt.toISOString()),
      ].join(','),
    );
  }
  // Segunda sección: todos los períodos.
  lines.push('');
  lines.push('periodos: username,starts_at,ends_at,price_usd,status,bank,reference');
  for (const p of allPeriods) {
    const c = allClients.find((x) => x.id === p.clientId);
    lines.push(
      [
        esc(c?.username ?? ''),
        esc(p.startsAt.toISOString()),
        esc(p.endsAt.toISOString()),
        String(p.priceUsd),
        esc(p.status),
        esc(p.bank ?? ''),
        esc(p.referenceNorm ?? ''),
      ].join(','),
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="mecanico-virtual-clientes.csv"',
  );
  res.send('\uFEFF' + lines.join('\n'));
});

router.post('/admin/cleanup', authAdmin, async (_req: Request, res: Response) => {
  const result = await runCleanup();
  res.json({ ok: true, ...result });
});

/* ---------------- catálogo (para depuración / front) ---------------- */

router.get('/catalog', async (_req: Request, res: Response) => {
  const parts = await fetchCatalog();
  res.json({ count: parts.length, parts: parts.slice(0, 200) });
});
