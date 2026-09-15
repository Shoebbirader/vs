CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notification_recipient_channel_key
  ON public.notification_deliveries ("notificationId", "recipientId", channel);
