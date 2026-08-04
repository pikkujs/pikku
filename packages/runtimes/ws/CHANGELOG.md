## 1.0.0

### Patch Changes

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.13.0

## 0.12.5

### Patch Changes

- 63ff32b: Run a CLI's commands on the server, over the connection the client opened

  A CLI that talks to a service has to ship the service's command tree, so the
  two versions drift: the binary someone installed months ago still believes in
  flags and commands the server has since changed. This makes the command tree
  the server's, and leaves the client holding only a socket.

  `wireCLI` gains `auth`, and a program wired with a channel entrypoint now
  generates a `__raw` route: the client forwards argv untouched, the server
  parses it, runs the command, and streams the output back as it happens. The
  terminating frame carries the exit code, so a failed remote command still exits
  non-zero locally. Renderers stay on the client and are matched by the command
  id the server reports; an unrecognised command falls back to JSON rather than
  failing.

  Every channel gains `channel.remote(...)`: calling a function on the peer at
  the other end of the connection and waiting for its answer. A channel is
  otherwise fire-and-forget in both directions, so this is what reaches a peer
  that has no address of its own — a CLI on a laptop, a browser tab, a sandbox
  behind NAT. It is on `channel` rather than `rpc` because it is bound to one
  connection: which peer answers is the socket the call goes out on, not
  something the RPC map could resolve. Any `wireChannel` gets it — a client
  registers what it is willing to answer to, and a name outside that list is
  refused.

  Requests are correlated by id, time out, and fail fast when the socket closes
  rather than waiting out the timeout. Replies are taken off the socket ahead of
  routing, so a channel needs no route for them and an answer can never be
  mistaken for a new message; the transport is created on first use and released
  when the channel closes, which is also what fails anything the departing peer
  still owed an answer to. Channels that only flow one way — SSE, an agent's
  output stream, a locally-run CLI — refuse the call outright instead of waiting
  for an answer that was never going to come.

  What a peer answers with is its word, so it is checked before a caller sees it
  — against the schema codegen already generated from the function's declared
  return type, the same one an agent tool or an HTTP response is checked against.
  A capability is declared with `pikkuRemoteChannelFunc`, which takes the usual
  `title` / `description` / `input` / `output` but no `func` — this side owns the
  contract, the peer owns the body. It registers under its name like any other
  function, so `channel.remote` is typed off the same generated map as
  `rpc.remote` and no caller has to cast, and a local call throws rather than
  missing: reaching it locally means a command asked the server for something
  only a client knows. A client on an older build fails the call it answered
  rather than the caller failing later somewhere with no reason to expect a bad
  shape; a name with no declared contract is left alone. Both frame guards
  validate the whole envelope rather than the action tag alone, and a failure
  payload with a non-string name or message falls back rather than being attached
  to an `Error`.

  The arguments going the other way are checked too, against the schema for the
  capability's declared input, before anything is registered or sent. That is not
  a boundary — the peer runs the code and has to check what it was handed, and a
  caller that meant harm would send arguments that pass. It catches drift, where a
  server built against a newer capability signature calls a client that predates
  it, and fails it here rather than inside someone else's process.

  A channel-driven CLI command uses this to ask its caller for machine-local
  facts mid-run — a git sha, a working tree, a local file. The CLI wire's own
  channel is synthetic (it exists so a command can stream progress without
  knowing where that goes), so it delegates `remote` to the connection the
  command actually arrived on.

  Because that runs code on someone's machine at a remote caller's request, the
  capability map says what _can_ run and approval says whether a particular call
  _should_. A capability may be declared `{ execute, needsApproval }`, sharing
  `ApprovalPolicy` — `needsApproval` and `approvalDescriptionFn` — with
  `AIAgentToolDef`, which has carried both since before channels could call back:
  both are an allowlist of named callables invoked by something other than the
  code that wrote them. The runtime around them is deliberately not shared, since
  an agent suspends its run and resumes it later while a reverse call is a live
  await with a person at the other end.

  A capability written as a bare function is unclassified, and unclassified means
  approval is required — the annotation nobody got round to writing is the one
  most likely to matter, so it fails closed. Declare
  `{ execute, needsApproval: false }` for a capability that may run unattended.
  Nothing infers this: core cannot tell a read-only capability from a destructive
  one, so `needsApproval: false` is the author asserting it, and the assertion is
  the only thing standing between a remote caller and the machine.

  The default is the opposite of `AIAgentToolDef`'s, where absence means "do not
  ask" — a tool is written by the same people who run the server it executes on,
  and a capability is not.

  `executeRawCLIViaChannel` reads `--auto-approve` and
  `--dangerously-auto-approve` out of argv (or `PIKKU_AUTO_APPROVE` /
  `PIKKU_DANGEROUSLY_AUTO_APPROVE`) and strips them before argv reaches the
  server — what may run on this machine is this machine's decision, and a flag
  the server can see is one the server could act on. `--auto-approve` permits the
  classified-safe set and refuses the rest; `--dangerously-auto-approve` permits
  everything and says so once on stderr. Interactively the user is asked per
  call, with `y` / `n` / `a`, where `a` is remembered for that one capability for
  the rest of the run and never written to disk — widening it to the session
  would quietly turn an interactive run into `--dangerously-auto-approve`. A run
  with no terminal and no flag refuses rather than assuming yes, because CI is
  exactly where an unattended `git push` would otherwise happen. The tiers are
  meaningful here in a way they would not be for an agent: the caller is a
  deterministic program whose source can be read, so "these calls are always
  fine" is a claim someone can actually justify.

  A peer that is asking a human sends a pending frame first, which stops the
  caller's timeout. Without it any approval slower than the timeout would fail
  the call and then discard the decision when it finally arrived. The call is
  still failed the moment the socket drops — what actually happens when a peer
  dies mid-prompt — and a peer that sends the frame dishonestly can do nothing
  but keep its own call waiting. A refusal is sent as an answer, so a denied call
  fails its command immediately rather than hanging.

  Fixes found on the way, each of which broke this path:
  - A websocket upgrade wrote middleware headers (CORS, on every request)
    straight onto the socket, so the first bytes a client saw were headers rather
    than `ws`'s `101` status line and the handshake failed to parse. Header
    writes are now buffered and flushed behind a status line only when the
    upgrade is actually being rejected.
  - An upgrade socket had no error listener while the channel opened, so a client
    that gave up mid-handshake took the whole server process down with an
    unhandled `ECONNRESET`.
  - `onConnect` and `onDisconnect` never saw the session established during the
    upgrade, so a channel could not tell who had just connected.
  - Setting the routing key on a channel result mutated the value in place, which
    throws for a primitive under ESM strict mode.

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73

## 0.12.4

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.3

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.0

## 0.12.2

### Patch Changes

- e3142ad: Sanitize HTTP header names and values in duplex response to prevent CRLF injection attacks.
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

# @pikku/ws

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

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.6

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.5

### Patch Changes

- 1c7dfb6: fix: fixing some import issues
- Updated dependencies [1c7dfb6]
  - @pikku/core@0.6.15

## 0.6.4

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.3

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.2

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work
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

## 0.5.6

### Patch Changes

- d2f8edf: feat: adding channelId to channels for serverless compatability
- Updated dependencies [662a6cf]
- Updated dependencies [c8578ea]
- Updated dependencies [d2f8edf]
  - @pikku/core@0.5.29

## 0.5.5

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.4

### Patch Changes

- ab42f18: chore: upgrading to next15 and dropping pages support
- Updated dependencies [ab42f18]
  - @pikku/core@0.5.26

## 0.5.3

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.2

### Patch Changes

- 8e8e816: fix: including missing packages

## 0.5.1

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- ee0c6ea: feat: adding ws server
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
