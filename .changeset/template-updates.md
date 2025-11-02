---
'@pikku/templates-aws-lambda': patch
'@pikku/templates-aws-lambda-websocket': patch
'@pikku/templates-bullmq': patch
'@pikku/templates-cli': minor
'@pikku/templates-cloudflare-websocket': patch
'@pikku/templates-cloudflare-workers': patch
'@pikku/templates-functions': patch
'@pikku/templates-mcp-server': patch
'@pikku/templates-nextjs': patch
'@pikku/templates-uws': patch
'@pikku/templates-ws': patch
---

Update templates for channel middleware and add new CLI template

**New Features:**
- Add new CLI template with channel support
- Improve channel middleware examples across templates

**Updates:**
- Update all templates to demonstrate channel middleware patterns
- Improve channel function examples (auth, logout, etc.)
- Update client examples for channels
- Add ignoreFiles configuration to template configs
- Update package versions
- Remove unnecessary test scripts from some templates

**Bug Fixes:**
- Simplify channel function return types in examples
- Fix Next.js API route configuration
