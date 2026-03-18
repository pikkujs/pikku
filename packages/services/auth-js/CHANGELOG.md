# @pikku/auth-js

## 0.12.3

### Patch Changes

- 87433f0: Log auth session decode failures at warn level instead of silently swallowing all errors.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9

## 0.12.2

### Patch Changes

- ffe83af: Add Auth.js integration package

  - `createAuthRoutes()` registers all Auth.js routes (signin, callback, session, signout, etc.) as Pikku HTTP routes
  - `createAuthHandler()` bridges Auth.js by converting Pikku requests to Web Requests and returning Web Responses directly
  - `authJsSession()` middleware reads Auth.js session cookies and bridges them into Pikku sessions
  - Supports config factory `(services) => AuthConfig` for accessing Pikku services in auth callbacks

- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
