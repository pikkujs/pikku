---
'@pikku/cli': patch
---

Re-run middleware codegen after the auth scaffold is generated. `pikkuAuth` writes `auth-middleware.gen.ts`, whose `addGlobalMiddleware` registers the better-auth session bridge, but the middleware pass ran before that file existed — so on a first-ever build nothing side-effect imported it and every session-requiring function answered `Authentication required`. It corrected itself on the second run, hiding the bug everywhere except clean CI builds.
