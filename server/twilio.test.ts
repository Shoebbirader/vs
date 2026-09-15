import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./db", () => ({ fleetDb: { notificationDelivery: { create: mocks.create } } }));

import { deliverOperationalNotification } from "./twilio";

describe("Twilio operational delivery guard", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({ id: "delivery" });
    delete process.env.TWILIO_ALERTS_ENABLED;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_API_KEY_SID;
    delete process.env.TWILIO_API_KEY_SECRET;
    delete process.env.TWILIO_SMS_FROM;
    delete process.env.TWILIO_WHATSAPP_FROM;
  });

  it("suppresses phone delivery for notification types outside the operational policy", async () => {
    await deliverOperationalNotification({ id: "notice-1", orgId: "org-1", recipientId: "member-1", title: "Routine update", message: "No action required", type: "PURCHASE_ORDER_DRAFT" }, { mobileNumber: "+919876543210", smsAlertsEnabled: true, whatsappAlertsEnabled: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("records opted-in operational channels as configuration-suppressed until Twilio is explicitly enabled", async () => {
    await deliverOperationalNotification({ id: "notice-2", orgId: "org-1", recipientId: "member-1", title: "Inventory below reorder level", message: "Brake pads need replenishment", type: "INVENTORY_LOW" }, { mobileNumber: "+919876543210", smsAlertsEnabled: true, whatsappAlertsEnabled: true });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls.map(([input]) => input.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "SMS", status: "SKIPPED_CONFIGURATION", notificationId: "notice-2" }),
      expect.objectContaining({ channel: "WHATSAPP", status: "SKIPPED_CONFIGURATION", notificationId: "notice-2" }),
    ]));
  });
});
