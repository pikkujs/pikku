---
'@pikku/templates-aws-lambda-websocket': patch
'@pikku/templates-bullmq': patch
'@pikku/templates-functions': patch
'@pikku/templates-mcp-server': patch
'@pikku/templates-pg-boss': patch
---

Update templates for file-based stores and consolidate test scripts

**AWS Lambda WebSocket Template:**

- Update to use FileChannelStore and FileEventHubStore for serverless environments
- Add bootstrap import for proper initialization
- Fix test URL (port 3001) and build command (add packages=external)

**BullMQ & PG-Boss Templates:**

- Remove duplicate run-tests.sh scripts
- Add test script in package.json to use shared test runner

**MCP Server Template:**

- Update test configuration to use tsx directly
- Add createSessionServices parameter to start.ts
- Fix tsconfig.json to set noEmit: true

**Functions Template:**

- Update createSessionServices signature to include all required parameters
