export type InvitationEmailInput = {
  organizationName: string;
  inviteeEmail: string;
  role: string;
  joinUrl: string;
  expiresAt: Date;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function renderInvitationEmail(input: InvitationEmailInput) {
  const organization = escapeHtml(input.organizationName);
  const email = escapeHtml(input.inviteeEmail);
  const role = escapeHtml(input.role.replaceAll("_", " "));
  const joinUrl = escapeHtml(input.joinUrl);
  const expiry = escapeHtml(input.expiresAt.toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }));
  return {
    subject: `Join ${input.organizationName} on VahanSync`,
    text: `You have been invited to join ${input.organizationName} on VahanSync as ${input.role.replaceAll("_", " ")}. Open this secure link to create your account: ${input.joinUrl}. This invitation expires on ${expiry}. If you were not expecting this invitation, you can ignore it.`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f1e8;color:#182033;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffdf8;border:1px solid #eadfd4;border-radius:16px"><p style="color:#f26b38;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">VahanSync</p><h1 style="font-size:28px;margin:24px 0 12px">Join ${organization}</h1><p style="color:#5f6875;line-height:1.6">You have been invited to join this organization as <strong>${role}</strong>. Create your VahanSync account using the secure button below.</p><p><a href="${joinUrl}" style="display:inline-block;padding:13px 18px;background:#f26b38;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Join organization</a></p><p style="color:#7b8490;font-size:13px;line-height:1.6">This link was sent to ${email} and expires on ${expiry}. VahanSync will only use this invitation to establish your organization membership and role.</p><p style="color:#9aa1aa;font-size:12px">If you were not expecting this invitation, you can ignore this email.</p></main></body></html>`,
  };
}

export type InvitationDeliveryResult = { id?: string; error?: { message: string } };

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: { message: "RESEND_API_KEY is not configured." } };
  const from = process.env.RESEND_FROM_EMAIL ?? "VahanSync <onboarding@resend.dev>";
  const email = renderInvitationEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.inviteeEmail], subject: email.subject, html: email.html, text: email.text }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (!response.ok) return { error: { message: payload.message ?? payload.name ?? `Resend returned HTTP ${response.status}.` } };
    return { id: payload.id };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Resend request failed." } };
  }
}
