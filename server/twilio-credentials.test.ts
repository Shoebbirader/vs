import { describe, expect, it } from "vitest";

describe("Twilio restricted operational-alert credential", () => {
  const configured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET);

  it.skipIf(!configured)("authenticates to Twilio without creating a message", async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const keySid = process.env.TWILIO_API_KEY_SID;
    const keySecret = process.env.TWILIO_API_KEY_SECRET;
    expect(accountSid).toBeTruthy();
    expect(keySid).toBeTruthy();
    expect(keySecret).toBeTruthy();
    if (process.env.TWILIO_SMS_FROM) expect(process.env.TWILIO_SMS_FROM).toMatch(/^\+\d{8,15}$/);
    if (process.env.TWILIO_WHATSAPP_FROM) expect(process.env.TWILIO_WHATSAPP_FROM).toMatch(/^whatsapp:\+\d{8,15}$/);
    if (process.env.TWILIO_TRIAL_TEST_TO) expect(process.env.TWILIO_TRIAL_TEST_TO).toMatch(/^\+\d{8,15}$/);
    if (process.env.TWILIO_TRIAL_TEST_TO) expect(["true", "false"]).toContain(process.env.TWILIO_ALERTS_ENABLED);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });

    // The intentionally malformed create request is rejected before any message can be queued. A 400 confirms the restricted Messages-create credential authenticated successfully.
    expect(response.status).toBe(400);
  }, 15_000);
});
