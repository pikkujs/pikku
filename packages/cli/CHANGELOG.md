# @pikku/cli

## 0.8.2

### Patch Changes

- a02347b: fix: only insert package mapping if it's not the same package
- Updated dependencies [0fb4b3d]
  - @pikku/core@0.8.2

## 0.8.1

### Patch Changes

- 44e3ff4: feat: enhance CLI filtering with type and directory filters

  - Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
  - Add --directories filter to filter by file paths/directories
  - All filters (tags, types, directories) now work together with AND logic
  - Add comprehensive logging interface to inspector package
  - Add comprehensive test suite for matchesFilters function
  - Support cross-platform path handling

- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:

  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- Updated dependencies [3261090]
- Updated dependencies [44e3ff4]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1
  - @pikku/inspector@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Support**: Complete MCP implementation with automatic generation of MCP JSON specifications, resources, tools, and prompts
- **Queue System**: Added queue support
- **RPC (Remote Procedure Calls)**: Added typed RPC call generation with local and remote procedure support
- **Multiple Bootstrap Files**: Added support for generating different transport-specific bootstrap files
- **Service Destructuring Analysis**: Added service destructuring analysis for better code generation
- **Bootstrap Files**: Added support for generating transport-specific bootstrap files
- **Service Destructuring**: Added service destructuring analysis for better code organization
- **Error Handling**: Improved error handling for complex type generation
- **Performance**: Optimized code generation for large projects with multiple event types

## 0.7.7

### Patch Changes

- a5e3903: fix: PikkuFetch import fix

## 0.7.6

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports
- 5c4f56f: fix: adding more options to schema generator to support complex types
- a9427b8: fix: import bootstrap file to include all rpc/function code in nextjs wrapper
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8
  - @pikku/inspector@0.7.7

## 0.7.5

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file
- Updated dependencies [faa1369]
  - @pikku/inspector@0.7.6

## 0.7.4

### Patch Changes

- 6af8a19: fix: always write functions meta data
- Updated dependencies [6af8a19]
  - @pikku/core@0.7.7

## 0.7.3

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!
- Updated dependencies [46d4458]
  - @pikku/core@0.7.5

## 0.7.2

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/inspector@0.7.4
  - @pikku/core@0.7.4

## 0.7.1

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/inspector@0.7.3
  - @pikku/core@0.7.3

## 0.7.0

- Now function first. No breaking changes for end user here, just internals

## 0.6.20

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware
- Updated dependencies [531f4b5]
  - @pikku/core@0.6.24

## 0.6.19

### Patch Changes

- 1c8c470: removing a console
- Updated dependencies [1c8c470]
  - @pikku/core@0.6.23

## 0.6.18

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/inspector@0.6.4
  - @pikku/core@0.6.22

## 0.6.17

### Patch Changes

- 57f5d8c: refactor: moving getSession out of nextjs wrapper since it bundles all routes and only needs middleware
- 141d690: feat: creating a nextJS http wrapper for proxying
- e5a5a12: feat: adding watch command (pikki all --watch)
- 0ad27a2: chore: switching from glon to tinyblobby

## 0.6.16

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state
- Updated dependencies [9fb2b99]
  - @pikku/core@0.6.19

## 0.6.15

### Patch Changes

- 93c70b5: feat: make user session service a required service for channels

## 0.6.14

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.13

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/inspector@0.6.3
  - @pikku/core@0.6.14

## 0.6.12

### Patch Changes

- f0a905d: fix: fixing optional data if no arguments present

## 0.6.11

### Patch Changes

- 3062086: fix: renaming AbstractFetch/Websocket to core
- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings
- Updated dependencies [eb8a8b4]
  - @pikku/core@0.6.13

## 0.6.10

### Patch Changes

- 06e71be: fix: use readFile instead of import for json file

## 0.6.9

### Patch Changes

- 7e7ec0c: chore: show packageVersion in cli header

## 0.6.8

### Patch Changes

- bdcc89a: feat: adding intro logo to cli based commands

## 0.6.7

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues
- Updated dependencies [7859b28]
- Updated dependencies [269a532]
  - @pikku/core@0.6.11

## 0.6.6

### Patch Changes

- 780d7c2: revert: using import for json
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.5

### Patch Changes

- 4357bca: feat: fixing up nextjs apis
- Updated dependencies [4357bca]
  - @pikku/core@0.6.6

## 0.6.4

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- a40a508: fix: Fixing some generation bugs and other minors
- 4855e68: refactor: changing all generated files to have a .gen in the default name suffix
- Updated dependencies [a40a508]
  - @pikku/inspector@0.6.2
  - @pikku/core@0.6.5

## 0.6.3

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/inspector@0.6.1
  - @pikku/core@0.6.4

## 0.6.2

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

## 0.6.1

### Patch Changes

- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches
- Updated dependencies [ed45ca9]
- Updated dependencies [adeb392]
  - @pikku/core@0.6.2

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.43

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability
- Updated dependencies [662a6cf]
- Updated dependencies [c8578ea]
- Updated dependencies [d2f8edf]
  - @pikku/core@0.5.29

## 0.5.42

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.41

### Patch Changes

- 3f2e365: fix: create custom types if one object thats not a valid alias

## 0.5.40

### Patch Changes

- 57731ed: fix: deleting a deadline in serializer

## 0.5.39

### Patch Changes

- 75a828d: feat: create schemas for custom types extracted from apis

## 0.5.38

### Patch Changes

- 6dc72d5: feat: add support for import attributes to cli options

## 0.5.37

### Patch Changes

- 5d03fac: refactor: removing some dead code

## 0.5.36

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations
- Updated dependencies [aa8435c]
  - @pikku/core@0.5.27

## 0.5.35

### Patch Changes

- 2160039: fix: fixing alias issue with generated types
- ab42f18: chore: upgrading to next15 and dropping pages support
- Updated dependencies [ab42f18]
  - @pikku/core@0.5.26

## 0.5.34

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.33

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- f37042d: fix: always print out core schema register file
- ee0c6ea: feat: adding ws server
- d97e952: refactor: removing requirement of config method outside of nextjs
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24

## 0.5.32

### Patch Changes

- e9a9968: refactor: completing rename of stream to channel
- Updated dependencies [7fa64a0]
- Updated dependencies [539937e]
- Updated dependencies [e9a9968]
  - @pikku/core@0.5.23

## 0.5.31

### Patch Changes

- 73973ec: fix: data type for methods is optional
- Updated dependencies [73973ec]
  - @pikku/core@0.5.22

## 0.5.30

### Patch Changes

- 179b9c2: fix: fixing stream types
- Updated dependencies [179b9c2]
  - @pikku/core@0.5.21

## 0.5.29

### Patch Changes

- b20ef35: fix: generate stream types from message array

## 0.5.28

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)
- Updated dependencies [5be6da1]
  - @pikku/core@0.5.20

## 0.5.27

### Patch Changes

- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli
- Updated dependencies [cbcc75b]
- Updated dependencies [d58c440]
- Updated dependencies [11c50d4]
  - @pikku/core@0.5.19

## 0.5.26

### Patch Changes

- b7b78bb: fix: add '& {}' to openapi interfaces as a workaround for not directly refering to a type since it confuses typescript

## 0.5.25

### Patch Changes

- 69d388d: refactor: switching to use config async creator

## 0.5.24

### Patch Changes

- 2307831: fix: removing unused import

## 0.5.23

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes
- Updated dependencies [30b46aa]
  - @pikku/core@0.5.13

## 0.5.22

### Patch Changes

- f8aa99f: feat: export pikkuFetch instance to avoid needing a singleton class
- Updated dependencies [ff8a563]
  - @pikku/core@0.5.12

## 0.5.21

### Patch Changes

- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on
- Updated dependencies [be68efb]
- Updated dependencies [5295380]
- Updated dependencies [f24a653]
  - @pikku/core@0.5.11

## 0.5.20

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/core@0.5.10

## 0.5.19

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9

## 0.5.18

### Patch Changes

- b237ace: feat: adding core errors to openapi error specs
- 1876d7a: feat: add error return codes to doc generation
- fda3869: fix: dont ignore decleration files when looking for types
- Updated dependencies [1876d7a]
- Updated dependencies [8d85f7e]
  - @pikku/core@0.5.8

## 0.5.17

### Patch Changes

- 25c6637: fix: fixing a type import for meta types

## 0.5.16

### Patch Changes

- 2654ef1: fix: testing relative files

## 0.5.15

### Patch Changes

- 707b26a: feat: save openapi as yml if needed

## 0.5.14

### Patch Changes

- 0883f00: fix: schema generation error
- Updated dependencies [0883f00]
  - @pikku/core@0.5.6

## 0.5.13

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard
- Updated dependencies [93b80a3]
  - @pikku/core@0.5.5

## 0.5.12

### Patch Changes

- 473ac6a: fix: correcting name of schema root file
  refactor: removing time change in generated files

## 0.5.11

### Patch Changes

- b3dcfc4: feat: adding a bootstrap file to simplify usage

## 0.5.10

### Patch Changes

- 2c0e940: fix: reinspecting after type file is created

## 0.5.9

### Patch Changes

- 0e1f01c: fix: inccorect string replacement

## 0.5.8

### Patch Changes

- 2841fce: fix: create empty schema directory

## 0.5.7

### Patch Changes

- 3724449: fix: fixing a cli path issue

## 0.5.6

### Patch Changes

- 58a510a: refactor: moving routes map into a declaration file

## 0.5.5

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files
- Updated dependencies [6cac8ab]
  - @pikku/core@0.5.4

## 0.5.4

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience
- Updated dependencies [8065e48]
  - @pikku/core@0.5.3

## 0.5.3

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future
- Updated dependencies [5e0f033]
  - @pikku/core@0.5.2

## 0.5.2

### Patch Changes

- 8712f25: fix: relative paths need to start with ./ for imports to work

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

## 0.4.7

### Patch Changes

- c382ed3: putting glob back to 10 again for node 18 support

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong
- Updated dependencies [2a2402b]
  - @pikku/core@0.4.6

## 0.4.5

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 3019265: fix: ensuring node 18 compatability
- 642d370: fix: adding schema error logs on fail
- Updated dependencies [0650348]
- Updated dependencies [1a708a7]
- Updated dependencies [642d370]
  - @pikku/core@0.4.4

## 0.4.4

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.3

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.4.2

### Patch Changes

- 5a012d9: Fixing typedoc generation
