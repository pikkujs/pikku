---
'@pikku/better-auth': patch
---

`POST /sign-in/delegated` accepts `login` or `username` as well as `email`, and passes the identifier to `authenticate` as `credentials.login`. `email` still works as before. An identity marked `syntheticEmail` (a made-up address for an upstream user with no email) never attaches to an existing user row.
