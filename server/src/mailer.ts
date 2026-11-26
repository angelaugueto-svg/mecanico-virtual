import nodemailer, { type Transporter } from 'nodemailer';

export const STORE_EMAIL = 'motolabaa@gmail.com';

let transporter: Transporter | null = null;

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Envía un correo a la tienda. Si no hay SMTP configurado o el envío falla,
 * solo registra en el log y sigue: el registro/pago igual queda (SPEC).
 */
export async function sendStoreMail(subject: string, body: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.log(`[mail] sin SMTP — correo no enviado (asunto: ${subject})\n${body}`);
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: STORE_EMAIL,
      subject,
      text: body,
    });
    console.log(`[mail] enviado a ${STORE_EMAIL}: ${subject}`);
    return true;
  } catch (err) {
    console.error('[mail] falló el envío, el registro/pago igual queda:', err);
    return false;
  }
}
