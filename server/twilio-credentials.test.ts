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

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });

    // The intentionally malformed create request is rejected before any message can be queued. A 400 confirms the restricted Messages-create credential authenticated successfully.
    expect(response.status).toBe(400);
  });
});
