---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/better-auth': patch
---

An OAuth2 credential can set `scopeSeparator` for a provider that wants scopes joined by something other than a space (Twist wants a comma). A credential with no scopes already sent no `scope` parameter; that is now tested.
