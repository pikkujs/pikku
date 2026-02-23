## 0.12.0

## 1.0.0

### Patch Changes

- Updated dependencies [6cb7e98]
- Updated dependencies [7c1f909]
- Updated dependencies [6cb7e98]
- Updated dependencies [6cb7e98]
- Updated dependencies [7dd13cc]
- Updated dependencies [581fe3c]

  - @pikku/core@0.12.0

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
