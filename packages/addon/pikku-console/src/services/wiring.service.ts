// WiringService and the AllMeta types now live in @pikku/core (MIT) so Studio
// and the controlplane can share them. Re-exported here so existing imports
// (including `@pikku/addon-console/services`) keep working until the console
// is removed.
export * from '@pikku/core/services/wiring-service'
