## 0.11.0

## 0.11.1

### Patch Changes

- bb223d5: feat: adding in pikkuSimpleWorkflowFunc

### Minor Changes

- Add workflow orchestration engine with step execution and retries
- Add scheduler service abstraction
- Remove file-based channel and eventhub stores

# @pikku/core

## 0.10.2

### Patch Changes

- ea652dc: Refactor channel middleware handling and add lifecycle middleware support

  **Breaking Changes:**

  - Improved middleware resolution for channel message handlers to properly combine channel-level and message-level middleware
  - Fixed cache key collisions when multiple message handlers use the same function

  **New Features:**

  - Add `runChannelLifecycleWithMiddleware` helper in `channel-common.ts` for consistent lifecycle function execution
  - Support middleware on `onConnect` and `onDisconnect` lifecycle functions
  - Channel-level middleware now properly applies to all messages in the channel

  **Bug Fixes:**

  - Fix middleware ordering: channel middleware → message middleware → inherited middleware
  - Fix cache key generation to include routing information (prevents cache collisions)
  - Properly detect wrapper objects vs direct function configs for message handlers

- 4349ec5: Add file-based storage implementations for serverless environments

  **New Services:**

  - Add `FileChannelStore` for file-based channel storage (suitable for AWS Lambda /tmp)
  - Add `FileEventHubStore` for file-based event hub subscriptions
  - Export new services in package.json for use in serverless runtimes

  **Bug Fixes:**

  - Fix serverless channel runner to handle disconnect gracefully when channel is already cleaned up
  - Fix MCP runner to pass `mcp` service to functions and use correct function type

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set

## 0.9.0

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.12-next.0

### Patch Changes

- feat: running @pikku/cli using pikku

## 0.9.11

### Patch Changes

- 6ee87c1: fix: local content server name slashes

## 0.9.10

### Patch Changes

- a2062b7: feat: adding a server url prefix for local content

## 0.9.9

### Patch Changes

- 99c2b3a: fix: removing duplicated interaction values from pikku functions

## 0.9.8

### Patch Changes

- ea89575: feat: adding the ability for custom schema validation / retrieving schemas to use (for example with openapi json_response)

## 0.9.7

### Patch Changes

- 85a1c76: fix: fixing delete method return type in local-content and ignoring body (for now) in delete calls

## 0.9.6

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- 74f8634: perf: moving router externally to be able to swap them out, similar to hono
- 766fef1: feat: adding caching for middleware and permissions

## 0.9.5

### Patch Changes

- 7e1f5b3: feat: implement ordered middleware and permission execution system

  ## New Features

  ### Ordered Execution System

  Both middleware and permissions now execute in a specific hierarchical order:

  1. **Wiring Tags** - Tag-based middleware/permissions from wiring level (e.g., HTTP route tags)
  2. **Wiring Middleware/Permissions** - Direct wiring-level middleware/permissions
  3. **Function Middleware** - Function-level middleware
  4. **Function Tags** - Tag-based middleware/permissions from function level

- b443405: feat: adding middleware and functions by tags

## 0.9.4

### Patch Changes

- c18800d: feat: adding queue and scheduledTask to interactions

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size

## 0.9.2

### Patch Changes

- 1256238: feat: pikkufunc in types extends function config to include all the different params
- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

- d3a9a09: refactor: change addMiddleware to addHTTPMiddleware due to route support'

  chore: export addHTTPMiddleware from pikku-types for consistency

- 840e078: refactor: change APIMiddleware type to PikkuMiddleware
- 667d23c: feat: adding expose to function config (although it isn't yet wired up)
- a5905a9: chore: updating all dependencies

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

## 0.8.2

### Patch Changes

- 0fb4b3d: refactor: mcp server expects json and not file path

## 0.8.1

### Patch Changes

- 3261090: refactor: moving mcp endpoints into core
- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:

  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- 30a082f: refactor: moving service implementations out of pikku/core since they aren't all edge compatible

### Major Features

- **Model Context Protocol (MCP) Support**: Added MCP implementation with resources, tools, and prompts
- **Queue System**: Added queue support with runners and workers
- **RPC (Remote Procedure Calls)**: Added typed RPC calls inside functions with local and remote support
- **Middleware Runner**: Added middleware runner to functions for enhanced request processing
- **Multiple Bootstrap Files**: Added support for different transport bootstrap files
- **Middleware Runner**: Run middleware on any function

## 0.7.8

### Patch Changes

- 8b4f52e: fix: nextjs compatability with 0.7
- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports

## 0.7.7

### Patch Changes

- 6af8a19: fix: always write functions meta data

## 0.7.6

### Patch Changes

- 6166c74: fix: odd missing file

## 0.7.5

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)

## 0.7.2

### Patch Changes

- bb59874: fix: only try validating schemas if they exist in function runner

## 0.7.1

### Patch Changes

- cd83e0a: fix: invalid logroutes log line

We now use the function first approach internally, which means first all the functions register, and then events call call them.

The main breaking changes for the end user are:

- We now declare functions using `pikkuFunc<In, Out>(async () => {})
- We renamed addRoute to wireHTTPs

We also removed all the different types of functions. Everything is now either an APIFunction of APIFunctionSessionless. The channel (eventHub or any other transport specific service) is now injected in the service itself.

## 0.6.27

### Patch Changes

- 8658745: refactor: changing content service to use streams for performance benefits
- d0968d2: fix: fixing content uploads for s3

## 0.6.26

### Patch Changes

- 412f136: updating local content service

## 0.6.25

### Patch Changes

- b774c7d: fix: coerce top level data from schema now includes date strings

## 0.6.24

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware

## 0.6.23

### Patch Changes

- 1c8c470: fix: await schema validation

## 0.6.22

### Patch Changes

- 60b2265: refactor: supporting request and response objects

## 0.6.21

### Patch Changes

- aab52d4: revert: add http back to all services until we figure out best way to set session from a function

## 0.6.20

### Patch Changes

- 1d43a9a: feat: adding context to allow middleware to set values (not typed)

## 0.6.19

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state

## 0.6.18

### Patch Changes

- 6be081b: fix: export addMiddleware correctly

## 0.6.17

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- 2c47386: refactor: improving middleware

## 0.6.16

### Patch Changes

- 3cbdf9e: fix: adding missing crypto import

## 0.6.15

### Patch Changes

- 1c7dfb6: fix: fixing some import issues

## 0.6.14

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels

## 0.6.13

### Patch Changes

- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings

## 0.6.12

### Patch Changes

- e0dd19a: fix: invalid schemas should result in a 422

## 0.6.11

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues

## 0.6.10

### Patch Changes

- 4a4a55d: refactor: renaming EError to PikkuError

## 0.6.9

### Patch Changes

- f3550d8: feat: changing singleton constructor to accept a prtial map of existing services

## 0.6.8

### Patch Changes

- b19aa86: refactor: switching aws to using @aws-sdk/cloudfront-signer

## 0.6.7

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)

## 0.6.6

### Patch Changes

- 4357bca: feat: fixing up nextjs apis

## 0.6.5

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors

## 0.6.4

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references

## 0.6.3

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work

## 0.6.2

### Patch Changes

- ed45ca9: feat: adding lambda serverless
- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches

## 0.6.1

### Patch Changes

- dee2e9f: feat: adding a subscription service change handler

Marking a major release to include channels and scheduled tasks

## 0.5.29

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability

## 0.5.28

### Patch Changes

- a768bad: feat: adding channel permission service
- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides

## 0.5.27

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations

## 0.5.26

### Patch Changes

- ab42f18: chore: upgrading to next15 and dropping pages support

## 0.5.25

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage

## 0.5.24

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- ee0c6ea: feat: adding ws server

## 0.5.23

### Patch Changes

- 7fa64a0: feat: making schedule session services optional
- 539937e: refactor: use a map instead for scheduled tasks
- e9a9968: refactor: completing rename of stream to channel

## 0.5.22

### Patch Changes

- 73973ec: fix: data type for methods is optional

## 0.5.21

### Patch Changes

- 179b9c2: fix: fixing stream types

## 0.5.20

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)

## 0.5.19

### Patch Changes

- cbcc75b: feat: adding scheduler types to core
- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli

## 0.5.18

### Patch Changes

- bed9ab4: revert: reverting ajv array transformation
- d4dd093: feat: coerce top level strings to arrays

## 0.5.17

### Patch Changes

- 2f77f5f: feat: coerce array types if needed via ajv validation

## 0.5.16

### Patch Changes

- 4046a85: feat: adding more error types

## 0.5.15

### Patch Changes

- 816eaaa: fix: don't throw an error if auth isnt required for a route

## 0.5.14

### Patch Changes

- 8531c5e: fix: export log routes in index since bundler can't find it

## 0.5.13

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes

## 0.5.12

### Patch Changes

- ff8a563: feat: only log warning errors for status codes we care about

## 0.5.11

### Patch Changes

- be68efb: fix: allow error handler to use errors other than EError
- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on

## 0.5.10

### Patch Changes

- effbb4c: doc: adding readme to all packages

## 0.5.9

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs

## 0.5.8

### Patch Changes

- 1876d7a: feat: add error return codes to doc generation
- 8d85f7e: feat: load all schemas on start optionally instead of validating they were loaded

## 0.5.7

### Patch Changes

- df62faf: fix: bumping up routes meta

## 0.5.6

### Patch Changes

- 0883f00: fix: schema generation error

## 0.5.5

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard

## 0.5.4

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files

## 0.5.3

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience

## 0.5.2

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future

## 0.5.1

### Patch Changes

- 97900d2: fix: exporting plugins from default barrel files
- d939d46: refactor: extracting nextjs and fastify to plugins
- 45e07de: refactor: renaming packages and pikku structure

## 0.4.7

### Patch Changes

- ddaf58f: feat: adding hostname to servers

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong

## 0.4.5

### Patch Changes

- c73afd6: this should have been published..

## 0.4.4

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 642d370: fix: adding schema error logs on fail

## 0.4.3

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.2

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.0.18 - 05.09.2022

feat: adding a maximum compute time for better error handling on lambda timeouts

## 0.0.17 - 24.08.2022

fix: use error name instead of constructor for better management of instanceof

## 0.0.10 - 21.07.2022

feat: add a transform session call incase jwt provided belongs to a third-party like aws cognito

## 0.0.9 - 26.06.2022

chore: Upgrading dependencies

## 0.0.6 - 13.04.2022

chore: Upgrading dependencies

## 0.0.5 - 19.02.2022

chore: Upgrading dependencies

## 0.0.4 - 26.09.2021

feat: Adding writeFile, readFile and deleteFile APIs

## 0.0.3 - 02.09.2021

chore: Updating dependencies

## 0.0.2 - 02.08.2021

Fix: deleting files with correct path in local files

## 0.0.1 - 27.07.2021

Fix: Using global space for schemas as it appears to not always return the same file

## 23.07.2021

### Initial Release

A package that contains pikku types
