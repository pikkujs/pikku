---
'@pikku/core': patch
---

`postScenarioJson(url, { body, headers })` — one way for a scenario step to POST JSON at a route and keep what came back.

Every step that reaches past an actor was writing this by hand, and the copies had drifted. Two of them answered `response.json()`, which discards the status and **throws outright** when the target answers an empty body or an HTML error page — so a refusal, which is the expected outcome of a permissions scenario, surfaced as a parse error instead of as data. It returns a `ScenarioHttpResponse`, never throws on a non-2xx, and takes an optional `fetch` so a call that has to keep a session can be sent through a `ScenarioCookieJar`.

`ScenarioHttpResponse` and `readScenarioHttpResponse` are now generic in the body: `postScenarioJson<{ runId?: string }>(…)` types `body` at the call site instead of casting at every use. The default is still `unknown`, so nothing that omits the parameter changes.

`body`'s doc now says what it always did: a body that will not parse as JSON is carried as its raw text, not dropped.
