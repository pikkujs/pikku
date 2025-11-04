---
'@pikku/core': patch
---

Add file-based storage implementations for serverless environments

**New Services:**

- Add `FileChannelStore` for file-based channel storage (suitable for AWS Lambda /tmp)
- Add `FileEventHubStore` for file-based event hub subscriptions
- Export new services in package.json for use in serverless runtimes

**Bug Fixes:**

- Fix serverless channel runner to handle disconnect gracefully when channel is already cleaned up
- Fix MCP runner to pass `mcp` service to functions and use correct function type
