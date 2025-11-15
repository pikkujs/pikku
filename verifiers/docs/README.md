# Documentation Verifier

This package verifies that Pikku's documentation generation works correctly. It tests:

## JSDoc Metadata Extraction

Validates that JSDoc tags (`@summary`, `@description`, `@errors`) are correctly extracted from function definitions and included in the verbose metadata files.

Tests cover:
- Channel functions (onConnect, onDisconnect, authenticate)
- Scheduler functions (myScheduledTask)
- HTTP functions (welcomeToPikku, helloWorld)
- Queue worker functions (queueWorker, queueWorkerWithMiddleware)
- MCP functions (sayHello, calculate, getStaticResource, getUserInfo, staticPromptGenerator, dynamicPromptGenerator)
- CLI functions (greetUser, addNumbers)
- Workflow functions (flakyHappyRPC, alwaysFailsRPC)

## OpenAPI Specification Generation

Validates that the OpenAPI specification is correctly generated from HTTP routes.

Tests verify:
- Correct OpenAPI version (3.1.0)
- All HTTP routes are documented
- HTTP methods are properly included
- Schema components are generated
- Route descriptions are present

## Configuration

This package extends `../../templates/functions/pikku.config.json` and enables:
- `verboseMeta: true` - Generates verbose metadata with JSDoc information
- `openAPI` - Generates OpenAPI specification

## Running Tests

```bash
node --import tsx --test test.ts
```

All tests load generated files from `../../templates/functions/.pikku` since this package extends that configuration.
