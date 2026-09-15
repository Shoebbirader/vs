# Razorpay Test Mode Notes

Razorpay official documentation confirms that Test Mode is a sandbox where real payments cannot be accepted and that Test Mode API keys can be generated without adding a website. Test and Live modes use separate API key pairs.

Razorpay’s webhook validation guidance states that Test Mode events can be tested on a staging environment, webhook signatures use HMAC-SHA256 over the raw request body and the `X-Razorpay-Signature` header, and duplicate deliveries should be handled with the `x-razorpay-event-id` header. Webhook URLs need to be publicly reachable over HTTPS; localhost cannot receive webhook delivery directly.

Razorpay’s subscription testing guidance requires Test Mode key credentials, supports simulated subscription charges and success/failure scenarios, and exposes subscription lifecycle webhooks such as activation, charge, pending, and halted events.

Sources:
- https://razorpay.com/docs/payments/dashboard/test-live-modes/?preferred-country=US — Test and Live Modes
- https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/?preferred-country=US — API Keys
- https://razorpay.com/docs/webhooks/validate-test/?preferred-country=US — Validate and Test Webhooks
- https://razorpay.com/docs/payments/subscriptions/test/?preferred-country=US — Test Subscriptions
