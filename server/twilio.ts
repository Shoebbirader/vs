import { fleetDb } from "./db";

const OPERATIONAL_ALERT_TYPES = new Set(["MAINTENANCE_THRESHOLD", "INVENTORY_LOW", "DOCUMENT_EXPIRY", "ALERT_ESCALATION", "WORK_ORDER_ESCALATION"]);
type Channel = "SMS" | "WHATSAPP";

function configured(channel: Channel) {
  const hasCredential = Boolean((process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) || process.env.TWILIO_AUTH_TOKEN);
  return process.env.TWILIO_ALERTS_ENABLED === "true" && Boolean(process.env.TWILIO_ACCOUNT_SID && hasCredential && (channel === "SMS" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM));
}

async function recordDelivery(input: { orgId: string; notificationId: string; recipientId: string; channel: Channel; status: string; providerMessageId?: string; errorCode?: string; errorMessage?: string; contentSid?: string; sentAt?: Date }) {
  return fleetDb.notificationDelivery.create({ data: { id: crypto.randomUUID(), ...input, attempt: 1, createdAt: new Date(), updatedAt: new Date() } });
}

function operationalMessage(title: string, message: string) {
  return `VahanSync operational alert: ${title}. ${message}`.slice(0, 1500);
}

async function sendTwilioMessage(channel: Channel, to: string, title: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const credentialSid = process.env.TWILIO_API_KEY_SID ?? accountSid;
  const credentialSecret = process.env.TWILIO_API_KEY_SECRET ?? process.env.TWILIO_AUTH_TOKEN!;
  const body = new URLSearchParams({ To: channel === "WHATSAPP" ? `whatsapp:${to}` : to, From: channel === "WHATSAPP" ? process.env.TWILIO_WHATSAPP_FROM! : process.env.TWILIO_SMS_FROM! });
  const contentSid = channel === "WHATSAPP" ? process.env.TWILIO_WHATSAPP_CONTENT_SID : undefined;
  if (contentSid) {
    body.set("ContentSid", contentSid);
    body.set("ContentVariables", JSON.stringify({ "1": title, "2": message }));
  } else {
    body.set("Body", operationalMessage(title, message));
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${credentialSid}:${credentialSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json().catch(() => ({})) as { sid?: string; code?: number; message?: string };
  if (!response.ok) throw Object.assign(new Error(payload.message ?? `Twilio delivery failed with HTTP ${response.status}.`), { code: payload.code ? String(payload.code) : String(response.status) });
  return { providerMessageId: payload.sid, contentSid };
}

export async function deliverOperationalNotification(notification: { id: string; orgId: string; recipientId: string; title: string; message: string; type: string }, recipient: { mobileNumber?: string | null; smsAlertsEnabled?: boolean | null; whatsappAlertsEnabled?: boolean | null }) {
  if (!OPERATIONAL_ALERT_TYPES.has(notification.type) || !recipient.mobileNumber) return;
  const channels: Channel[] = [recipient.smsAlertsEnabled ? "SMS" : null, recipient.whatsappAlertsEnabled ? "WHATSAPP" : null].filter(Boolean) as Channel[];
  for (const channel of channels) {
    if (!configured(channel)) {
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "SKIPPED_CONFIGURATION" });
      continue;
    }
    try {
      const result = await sendTwilioMessage(channel, recipient.mobileNumber, notification.title, notification.message);
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "SENT", providerMessageId: result.providerMessageId, contentSid: result.contentSid, sentAt: new Date() });
    } catch (error) {
      const failure = error as Error & { code?: string };
      await recordDelivery({ orgId: notification.orgId, notificationId: notification.id, recipientId: notification.recipientId, channel, status: "FAILED", errorCode: failure.code, errorMessage: failure.message.slice(0, 500) });
    }
  }
}
