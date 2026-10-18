---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/skills': patch
---

The generated `betterAuthStatelessSession` now reads the session cookie the way the auth config writes it. The inspector reads `advanced.cookiePrefix`, `session.cookieCache.strategy` and `session.cookieCache.version` from the `betterAuth({...})` call when they are string literals, and the CLI passes them through. Before this, an app with a custom cookie prefix was anonymous on every request, and bumping the cookie version invalidated nothing.

If one of these options is set but isn't a string literal (an environment variable, for example), or a later spread in the same object can replace it (`{ version: '2', ...override }`), the inspector warns about it and does not pass the value on. A spread written before the option is fine, because the option wins. In that case, register `betterAuthStatelessSession({ cookiePrefix, cookieCache })` yourself with `addGlobalMiddleware`. Your registration runs before the generated one, and the generated one then does nothing. `cookieCache.jwt` is never passed through and needs that same manual registration.
