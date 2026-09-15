/**
 * Compatibility entrypoint for Drizzle tooling.
 *
 * FleetOps uses the PostgreSQL schema in `fleetops-schema.ts`, which is also
 * the schema configured by drizzle.config.ts. Keeping this file as a re-export
 * prevents the former MySQL template from being mistaken for an active model.
 */
export * from "./fleetops-schema";
