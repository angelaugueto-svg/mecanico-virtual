import Anthropic from '@anthropic-ai/sdk';
import { type CatalogPart } from './catalog';

export const STUB_MODE = !process.env.ANTHROPIC_API_KEY;
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

const WHATSAPP = '0422-720-1274';
export const GREETING = '¡Hola! Soy Cheo, el mecánico. ¿En qué te puedo ayudar?';

export interface CheoResult {
  answer: string;
  causes: string[];
  parts: CatalogPart[];
  stub: boolean;
}

export type AskMode = 'question' | 'not-that' | 'solved' | 'explain-easier' | 'how-to';

const SYSTEM_PROMPT = `Eres Cheo, el mecánico de Motolab AA, una tienda de repuestos de motos en Venezuela.
Reglas firmes:
- Educado y respetuoso. Responde solo lo que sabes con seguridad, sin inventar.
- Si no sabes, dilo y recomienda escribir por WhatsApp ${WHATSAPP}.
- Razona desde el síntoma. No digas "pana" ni "el mecánico de Motolab AA".
- Solo responde las causas: no menciones repuestos, compras, precios ni el catálogo. Nunca digas que no tienes el catálogo ni que hay que comprar algo.
- No saludes: el saludo ya se muestra aparte. No digas "Hola, soy Cheo".
- Respuestas cortas y directas, en este formato exacto:
  Resumen: 1-2 frases.
  Causas: máximo 3, una por línea, la más probable primero.
  Pasos: máximo 5 pasos cortos (solo si el cliente pidió "¿Cómo lo hago?"; si no, omite esta sección).
- Antes de afirmar compatibilidad, pregunta marca, modelo, año y cilindrada.
- Si no te dieron marca, modelo, año y cilindrada, pídelos antes de dar causas; no respondas la falla sin esos datos.
- Da la respuesta y cállate: sin invitar a seguir preguntando, sin relleno, sin despedidas.
- Si el cliente dice que ya lo solucionó, responde con una frase corta y seca, sin entusiasmo.
- No menciones a Angela ni dónde está la tienda.`;

interface StubRule {
  match: RegExp;
  causes: string[];
  steps: string[];
  keywords: string[];
}

const STUB_RULES: StubRule[] = [
  {
    match: /no enciende|no prende|no arranca|enciende/i,
    causes: [
      'Bujía sucia o quemada',
      'Batería descargada o con bornes sulfatados',
      'Carburador sucio o con gasolina vieja',
    ],
    steps: [
      'Revisa que haya gasolina y que la llave de paso esté abierta.',
      'Saca la bujía y mira si está negra o mojada; límpiala o cámbiala.',
      'Revisa los bornes de la batería y que estén apretados.',
      'Intenta encender con el ahogador (cebador) puesto.',
      'Si sigue sin encender, revisa el carburador.',
    ],
    keywords: ['bujía', 'batería', 'carburador'],
  },
  {
    match: /ruido|suena|chilla|golpe|vibra/i,
    causes: [
      'Cadena floja o sin lubricar',
      'Pastillas de freno gastadas',
      'Tornillería floja por vibración',
    ],
    steps: [
      'Identifica de dónde viene el ruido: motor, cadena o frenos.',
      'Revisa la tensión y lubricación de la cadena.',
      'Revisa las pastillas de freno.',
      'Aprieta tornillos visibles del escape y las tapas.',
      'Si el ruido viene de dentro del motor, no sigas rodando.',
    ],
    keywords: ['cadena', 'pastilla', 'freno'],
  },
  {
    match: /apaga|pierde fuerza|se ahoga|jalonea|fuerza/i,
    causes: [
      'Filtro de aire tapado',
      'Carburador desajustado o sucio',
      'Bujía en mal estado',
    ],
    steps: [
      'Revisa el filtro de aire y límpialo o cámbialo.',
      'Revisa la bujía.',
      'Verifica que la gasolina no tenga agua.',
      'Revisa la manguera de gasolina.',
      'Si sigue igual, hay que limpiar el carburador.',
    ],
    keywords: ['filtro', 'carburador', 'bujía'],
  },
  {
    match: /freno|frena/i,
    causes: [
      'Pastillas de freno gastadas',
      'Disco de freno rayado o torcido',
      'Falta de liga de freno',
    ],
    steps: [
      'Revisa el nivel de liga de freno.',
      'Revisa el grosor de las pastillas.',
      'Revisa que el disco no esté rayado.',
      'Purgar el sistema si el freno se siente esponjoso.',
      'Si no frena bien, no ruedes hasta revisarlo.',
    ],
    keywords: ['pastilla', 'disco', 'freno'],
  },
  {
    match: /luz|bateria|batería|arranque|corriente/i,
    causes: [
      'Batería descargada',
      'Bornes sulfatados o flojos',
      'Bombillo o fusible quemado',
    ],
    steps: [
      'Revisa los bornes de la batería.',
      'Mide la carga de la batería.',
      'Revisa los fusibles.',
      'Revisa el bombillo.',
      'Si la batería no carga, puede que esté dañada.',
    ],
    keywords: ['batería', 'bombillo', 'fusible'],
  },
];

function formatStubAnswer(
  causes: string[],
  steps: string[],
  _parts: CatalogPart[],
  howTo: boolean,
): string {
  const lines: string[] = [];
  lines.push(`Resumen: ${causes[0] ? `Lo más probable es: ${causes[0].toLowerCase()}.` : 'Hay que revisar la moto.'}`);
  lines.push('Causas:');
  causes.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  if (howTo) {
    lines.push('Pasos:');
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  // Sin sección de repuestos en el texto: los repuestos se muestran aparte
  // en tarjetas (con código y precio) y no se leen en voz alta.
  return lines.join('\n');
}

export async function askCheoStub(
  message: string,
  mode: AskMode,
  vehicle?: { brand?: string; model?: string; year?: string; cc?: string },
): Promise<CheoResult> {
  if (mode === 'solved') {
    return { answer: 'Entendido. Quedó anotado.', causes: [], parts: [], stub: true };
  }
  const rule =
    STUB_RULES.find((r) => r.match.test(message)) ??
    STUB_RULES[0];
  const causes = mode === 'not-that' ? rule.causes.slice(1) : rule.causes;
  let answer = formatStubAnswer(causes, rule.steps, [], mode === 'how-to');
  if (mode === 'explain-easier') {
    answer =
      `Resumen: En palabras simples, ${causes[0] ? causes[0].toLowerCase() : 'hay algo que revisar'}.\n` +
      `Causas:\n1. ${causes[0] ?? 'Revisar la moto'}\n`;
  }
  if (mode === 'how-to') {
    answer = formatStubAnswer(causes, rule.steps, [], true);
  }
  void vehicle;
  return { answer, causes, parts: [], stub: true };
}

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

export async function askCheoReal(
  message: string,
  mode: AskMode,
  vehicle?: { brand?: string; model?: string; year?: string; cc?: string },
  history?: { question: string; answer: string }[],
): Promise<CheoResult> {
  if (mode === 'solved') {
    return { answer: 'Entendido. Quedó anotado.', causes: [], parts: [], stub: false };
  }

  const vehicleLine = vehicle?.brand || vehicle?.model
    ? `Moto del cliente: marca ${vehicle.brand ?? '?'}, modelo ${vehicle.model ?? '?'}, año ${vehicle.year ?? '?'}, cilindrada ${vehicle.cc ?? '?'} cc.`
    : 'El cliente no indicó marca, modelo, año ni cilindrada.';
  const modeHint =
    mode === 'not-that'
      ? 'El cliente ya revisó la causa anterior y NO era eso: pasa a la siguiente causa probable sin repetir las descartadas.'
      : mode === 'explain-easier'
        ? 'Explica lo mismo pero más fácil, con palabras simples.'
        : mode === 'how-to'
          ? 'El cliente pregunta "¿Cómo lo hago?": explica solo el paso a paso de la revisión nombrada en la respuesta anterior.'
          : 'Responde a la pregunta del cliente.';
  const historyBlock = (history ?? [])
    .slice(-4)
    .map((h) => `Cliente: ${h.question}\nCheo: ${h.answer}`)
    .join('\n---\n');

  const resp = await getAnthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          vehicleLine,
          historyBlock ? `Conversación reciente:\n${historyBlock}` : '',
          modeHint,
          `Pregunta del cliente: ${message}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  });
  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();
  // Solo causas: no se devuelven repuestos ni tarjetas.
  return {
    answer: text,
    causes: [],
    parts: [],
    stub: false,
  };
}

/** Punto de entrada: usa Anthropic si hay clave, si no el stub determinista. */
export async function askCheo(
  message: string,
  mode: AskMode,
  vehicle?: { brand?: string; model?: string; year?: string; cc?: string },
  history?: { question: string; answer: string }[],
): Promise<CheoResult> {
  if (STUB_MODE) return askCheoStub(message, mode, vehicle);
  try {
    return await askCheoReal(message, mode, vehicle, history);
  } catch (err) {
    console.error('[cheo] Anthropic falló, se usa stub:', err);
    const r = await askCheoStub(message, mode, vehicle);
    return { ...r, stub: true };
  }
}
