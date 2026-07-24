---
'@pikku/kysely-postgres': patch
---

PgEventHubService now accepts an optional inner transport hub. When supplied, subscribe/unsubscribe/publish and NOTIFY-relayed events are delivered through it instead of a private LocalEventHubService, so the service can share the SAME hub the server registered its sockets on (e.g. a BunEventHubService). Without an inner hub the behaviour is unchanged.
