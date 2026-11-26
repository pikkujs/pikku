---
'@pikku/cli': patch
'@pikku/queue-nats': patch
---

A package that ships services without being an addon (it exports `./.pikku/services/*` and no bootstrap) can be opted into with `wireAddon({ services })`: the generated bootstrap no longer imports a file the package does not have. The `nats` service gains a dev variant that provides an inert `natsLifecycle`, so `pikku dev` resolves it.
