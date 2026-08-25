# Twilio Setup Notes

The authenticated Twilio Console session was checked on 2026-08-25. The account is currently in trial mode. Trial SMS access was opened, and the WhatsApp trial environment was connected to one verified test recipient. The Console reports available test capacity for both channels.

The API-key credentials Console path was opened in the automated browser on 2026-08-25 but remained in its loading state. No credential, sender number, account identifier, or recipient number was accessed or written to the repository.

The authenticated Console root was retried later the same day and again remained in its loading state, with no browser-console error reported. No Twilio configuration was changed by the application setup process.

A dedicated restricted VahanSync operational-alert API credential was created with the Messages create capability only and then validated through a deliberately malformed, non-delivery request. Its values are stored only in encrypted server configuration. The delivery safety switch remains disabled. SMS sender discovery was then opened in the Console; no sender value has been copied into source control.

Subsequent sender discovery was blocked when the automated Twilio browser session returned to the login screen. No sender, content template, delivery preference, or trial configuration was changed after the credential was created.

After reauthentication, the existing Twilio trial SMS sender was identified in the Console and stored only in encrypted VahanSync and Vercel production configuration. The sender is intentionally not included in this file or source control. `TWILIO_ALERTS_ENABLED` remains false.

The corresponding Twilio WhatsApp trial sender was also identified and stored only in encrypted VahanSync and Vercel production configuration. The verified trial recipient must reconnect its WhatsApp test session before trial testing. No WhatsApp Content SID or production utility template exists yet, and VahanSync has not sent any SMS or WhatsApp message.

The application must not store Twilio credentials, account identifiers, or recipient phone numbers in source control. Before enabling live production delivery, configure encrypted server-side Twilio credentials, collect an approved sender for each channel, and ensure members have explicitly saved their phone number and channel preference. WhatsApp production notifications also require an approved utility template and recipient opt-in.

Console: https://console.twilio.com/
WhatsApp documentation: https://www.twilio.com/docs/whatsapp
SMS documentation: https://www.twilio.com/docs/messaging
