---
'@pikku/core': patch
---

`buildRemoteHeaders` (`@pikku/core/remote`) now fails closed when the secrets service errors while reading `PIKKU_REMOTE_SECRET`: it throws `Could not read PIKKU_REMOTE_SECRET from the secrets service; refusing to send an unauthenticated remote call` (with the backend error as `cause`) instead of silently sending the call without an `authorization` header, which the peer then answered with a bare 401. A secret that is simply not set (`hasSecret` returns false), or no secrets service at all, still sends an unauthenticated call as before. The lookup now goes through `secrets.hasSecret` before `getSecret`, so a custom `SecretService` must implement `hasSecret` as the interface already requires.
