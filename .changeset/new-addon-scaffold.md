---
'@pikku/cli': patch
---

Add `pikku new addon <name>` CLI subcommand for scaffolding addon packages:

- Generates full addon structure: package.json, pikku.config.json, tsconfig.json, API service, types, and README
- `--secret` flag generates wireSecret with API key schema
- `--oauth` flag generates wireOAuth2Credential + OAuth2Client-based API service
- `--variable` flag generates wireVariable definition
- `--no-test` flag skips test harness generation
- `--displayName`, `--description`, `--category`, `--dir` options for customization
- Test harness includes wireAddon, services, test function, and runner

Also adds `scaffold` config section to pikku.config.json for config-driven default directories across all `new` commands (addonDir, functionDir, wiringDir, middlewareDir, permissionDir).
