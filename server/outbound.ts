import { getDb, schema as s } from './db/client';

// The only way Voyage sends anything to the outside world (email, SMS, WhatsApp, voice
// calls, push). Real sending needs BOTH the provider key AND ALLOW_REAL_OUTBOUND=true.
// Otherwise the message is written to the in-app Outbox as a dry run.

export type Channel = 'email' | 'sms' | 'whatsapp' | 'voice' | 'push';

export interface OutboundMessage {
  userId: string;
  channel: Channel;
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  subject?: string | null;
  body: string;
  relatedType?: 'cancellation' | 'booking' | 'notification';
  relatedId?: string;
}

/** "+91 98200 12345" → "+91 ••••• •2345"; emails are kept (the user typed or owns them). */
export function maskAddress(channel: Channel, to: string) {
  if (channel === 'email' || channel === 'push') return to;
  const digits = to.replace(/\D/g, '');
  return digits.length <= 4 ? '••••' : `${to.trim().startsWith('+') ? '+' : ''}${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const providerKeyFor: Record<Channel, () => boolean> = {
  email: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  sms: () => Boolean(process.env.MSG91_AUTH_KEY || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)),
  whatsapp: () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
  voice: () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
  push: () => Boolean(process.env.FCM_SERVER_KEY),
};

/** True only when real sending is both configured and explicitly allowed. */
export const realSendingAllowed = (channel: Channel) => process.env.ALLOW_REAL_OUTBOUND === 'true' && providerKeyFor[channel]();

async function sendEmailForReal(m: OutboundMessage) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], cc: m.cc ? [m.cc] : undefined, reply_to: m.replyTo ?? undefined, subject: m.subject ?? 'Voyage', text: m.body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

/** Send (or, in demo mode, log) a message. Returns the Outbox row. */
export async function sendOutbound(m: OutboundMessage) {
  const { db } = await getDb();
  let status: 'dry_run' | 'sent' | 'failed' = 'dry_run';
  let provider: string | null = null;
  if (realSendingAllowed(m.channel)) {
    try {
      if (m.channel === 'email') {
        provider = 'resend';
        await sendEmailForReal(m);
        status = 'sent';
      } else {
        // SMS/WhatsApp/voice/push adapters plug in here; until then they stay dry runs.
        provider = m.channel;
        status = 'dry_run';
      }
    } catch {
      status = 'failed';
    }
  }
  const [row] = await db
    .insert(s.outboundMessages)
    .values({
      userId: m.userId,
      channel: m.channel,
      toAddress: maskAddress(m.channel, m.to),
      cc: m.cc ?? null,
      replyTo: m.replyTo ?? null,
      subject: m.subject ?? null,
      body: m.body,
      status,
      provider,
      relatedType: m.relatedType ?? null,
      relatedId: m.relatedId ?? null,
      sentAt: status === 'sent' ? new Date() : null,
    })
    .returning();
  return row;
}
