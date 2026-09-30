---
'@pikku/cli': patch
---

Fabric commands refuse a plain-`http:` API URL for any host but `localhost`, `127.0.0.1` and `::1`, and name the URL and where it came from (`--api-url`, `FABRIC_API_URL` or the last login). Before, `deploy`, `logs`, `projects` and the rest sent the bearer token unencrypted to whatever URL resolved. The check is in `resolveApiContext`, so every command has it.
