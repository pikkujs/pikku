## 0.6

## 0.6.10

### Patch Changes

- ccbef83: fix: validate against empty data payloads

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
