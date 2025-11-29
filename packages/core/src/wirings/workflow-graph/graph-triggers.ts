// Graph triggers are handled by their respective wirings:
// - HTTP triggers: handled in http-runner.ts (checks meta.graph)
// - Queue triggers: handled by queue workers based on metadata
//
// This file is kept for potential future trigger types (webhooks, subscriptions, etc.)
