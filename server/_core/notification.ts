import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification title is required." });
  }
  if (typeof input.content !== "string" || !input.content.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification content is required." });
  }
  const title = input.title.trim();
  const content = input.content.trim();
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.` });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.` });
  }
  return { title, content };
};

/**
 * Retained for compatibility with the existing notification contract. FleetOps
 * delivers operational notifications through the Supabase-backed notifications
 * table; this helper only validates and logs optional platform-owner notices.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const validated = validatePayload(payload);
  console.info(`[FleetOps notification] ${validated.title}: ${validated.content}`);
  return true;
}
