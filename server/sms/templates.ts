/**
 * Parent-facing SMS templates now live in `@shared/sms-templates` so the client
 * (manual-send preview) and server render identical wording. Re-exported here to
 * keep existing server imports (`./templates`) stable.
 */
export * from "@shared/sms-templates";
