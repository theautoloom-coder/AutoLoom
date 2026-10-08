/**
 * Which build of the app this is, sent with every upload (owner, 8 Oct 2026).
 *
 * The server refuses uploads from a build below app_settings.min_app_build, so
 * an app too old to write correctly cannot write at all — it keeps its unsent
 * work and sends it once it has updated. Raise this (YYYYMMDDnn) whenever an
 * older app would damage data, ship it, then raise min_app_build on the server
 * to match (deploy/README.md, "Purana app band karna").
 */
export const APP_BUILD = 2026100901;
