# @pikku/mcp-server

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
