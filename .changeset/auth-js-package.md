---
"@pikku/auth-js": patch
---

Add Auth.js integration package

- `createAuthRoutes()` registers all Auth.js routes (signin, callback, session, signout, etc.) as Pikku HTTP routes
- `createAuthHandler()` bridges Auth.js by converting Pikku requests to Web Requests and returning Web Responses directly
- `authJsSession()` middleware reads Auth.js session cookies and bridges them into Pikku sessions
- Supports config factory `(services) => AuthConfig` for accessing Pikku services in auth callbacks
