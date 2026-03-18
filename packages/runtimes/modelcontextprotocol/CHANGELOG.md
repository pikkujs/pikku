## 0.12.0

## 0.12.4

### Patch Changes

- a2ee6d0: Return generic error message to MCP clients instead of leaking internal error details.
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

## 0.12.3

### Patch Changes

- 4ef2db4: Add Streamable HTTP transport support to PikkuMCPServer with connectStdio(), createHTTPRequestHandler(), and connectHTTP() convenience methods
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- e04531f: Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]

  - @pikku/core@0.12.1

- Updated dependencies

## 0.11.0

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: fix: fixing mcp version since it introduced lots of breaking changes
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Workflow support

# @pikku/mcp-server

## 0.10.1

### Patch Changes

- 730adb6: Update runtime adapters for channel middleware support

  **Updates:**

  - Update Cloudflare hibernation WebSocket server for middleware changes
  - Update Fastify response convertor for improved channel handling
  - Update MCP server for channel middleware support
  - Update Next.js runtime adapter for channel improvements

- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.2

### Patch Changes

- 0fb4b3d: refactor: mcp server expects json and not file path
- Updated dependencies [0fb4b3d]
  - @pikku/core@0.8.2

## 0.8.1

### Patch Changes

- 3261090: refactor: moving mcp endpoints into core
- Updated dependencies [3261090]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1

## 0.8.0

### Major Features

- **MCP Implementation**: Partial implementation of Model Context Protocol server runtime with resources, tools, and prompts
- **Automatic Tool Registration**: Automatic registration of tools from Pikku bootstrap files
- **Resource Management**: Support for MCP resources
- **Prompt System**: Support for prompt system integration

## 0.7.0

### Added

- Initial implementation of Pikku MCP server runtime
- Integration with official MCP SDK
- Automatic tool registration from Pikku bootstrap files
- Configurable server options (name, version, capabilities)
- Support for ListToolsRequestSchema and CallToolRequestSchema handlers
