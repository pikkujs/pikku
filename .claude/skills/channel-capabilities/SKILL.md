---
name: channel-capabilities
description: "Use when a server-side function needs something only the connected client knows or can do — a git sha, a working tree, a local file, a push — or when writing or reviewing `channel.remote`, capability maps, or approval policy. Covers reverse RPC over a channel, which end is untrusted, why an unclassified capability needs approval, and the pending-frame/timeout interaction. Triggered by: 'the command needs the client's git sha', 'expose a capability to the server', 'why is it asking me to approve this', 'add channel.remote to X'. Not for ordinary `rpc.remote` between deployed units, which needs no capability map."
metadata:
  version: 1.0.0
---

# Reverse RPC over a channel

A channel is fire-and-forget in both directions. `channel.remote(name, data)`
is the exception: it calls a function on the peer at the other end of the
connection and waits for the answer. It exists to reach a peer that has no
address of its own — a CLI on a laptop, a browser tab, a sandbox behind NAT.

It is on `channel`, not `rpc`, and that is not cosmetic: which peer answers is
decided by the socket the call goes out on, not by anything the RPC map could
resolve. Any `wireChannel` has it. One-way channels (SSE, an agent's output
stream, a locally-run CLI) refuse the call at once rather than waiting out a
timeout for an answer that was never coming.

## The two ends

**Declare the contract as an ordinary function.** That is what gives the call a
type and a schema. The body is what happens if it is ever invoked locally,
which would mean a command asked the server for something only a client knows:

```ts
export const localCheckout = pikkuSessionlessFunc<
  void,
  { sha: string; branch: string }
>({
  auth: false,
  func: async () => {
    throw new Error('localCheckout runs on the connected client')
  },
})
```

**Call it from the server side.** Typed off the same generated map as
`rpc.remote`, so no cast:

```ts
const { sha, branch } = await cli!.channel!.remote('localCheckout')
```

**Expose it on the client.** `capabilities` is an allowlist, not a convenience
— a name outside it is refused, and refused the same way an unknown name is, so
a server cannot probe for what a client can do:

```ts
await ReleaseCLIClient(ws, process.argv.slice(2), {
  localCheckout: {
    execute: () => readCheckout(),
    needsApproval: false,
  },
})
```

## Who is untrusted, and where

This is the thing people get backwards. In an agent, the server owns the tools,
the model is the untrusted decider, and approval protects the server. Here it
is inverted: the **client** owns the capabilities, the **server** is the
decider, and approval protects the laptop the code runs on. So the prompt lives
at the opposite end, and none of the agent surfacing code is reusable.

Two consequences:

- **What the peer answers is checked** against the schema for the declared
  return type, at the transport, before it reaches the command. A client on an
  older build fails the call it answered, rather than the command failing later
  somewhere that had no reason to expect a bad shape.
- **What the server sends is also checked**, against the input schema — but
  that is *not* a boundary. It catches version drift. A caller that meant harm
  would send arguments that pass. The peer runs the code and must validate what
  it is handed.

## Approval: consent, not validation

The capability map says what *can* run. Approval says whether a particular call
*should*. Validation cannot substitute: a compromised server sends perfectly
valid arguments.

```ts
// unclassified — a prompt before every call
{ localPush: (data) => push(data) }

// classified safe — runs unattended
{ gitHead: { execute: () => head(), needsApproval: false } }
```

**A bare function is unclassified, and unclassified means approval is
required.** The annotation nobody got round to writing is the one most likely
to matter, so it fails closed. `needsApproval` is *required* on the object form
so that "unclassified" is unrepresentable there.

This is the opposite default from `AIAgentToolDef`, where absence means "do not
ask" — a tool is written by the same people who run the server it executes on,
and a capability is not. The two share `ApprovalPolicy` (`needsApproval`,
`approvalDescriptionFn`) and deliberately share no runtime: an agent suspends
its run and resumes later, a reverse call is a live await with a person at the
other end.

`approvalDescriptionFn` is what makes a prompt readable — without it the user is
asked about `localPush` and a JSON blob; with it, about "push tag v2.1.0 to
origin".

### Classifying honestly

The gradient is **closed arguments vs open ones**, not read vs write:

- `gitHead()` is bounded however hostile the server is → `needsApproval: false`
  is defensible.
- `readFile({ path })` is unbounded regardless of how harmless the name sounds
  → it needs approval.

Nothing infers this. Core cannot tell a read-only capability from a destructive
one, so `needsApproval: false` is the author asserting it, and that assertion is
the only thing between a remote caller and the machine.

### The tiers a CLI wires

`executeRawCLIViaChannel` reads `--auto-approve` and
`--dangerously-auto-approve` out of argv (or `PIKKU_AUTO_APPROVE` /
`PIKKU_DANGEROUSLY_AUTO_APPROVE`) and **strips them before argv reaches the
server** — what may run on this machine is this machine's decision, and a flag
the server can see is one the server could act on.

| mode | behaviour |
| --- | --- |
| interactive | `y` / `n` / `a` per call; `a` is remembered for that one capability, for that run, never on disk |
| `--auto-approve` | runs the classified-safe set, refuses the rest without asking |
| `--dangerously-auto-approve` | runs everything, says so once on stderr |
| no TTY, no flag | refuses — CI is exactly where an unattended `git push` would otherwise happen |

Auto tiers are meaningful here in a way they would not be for an agent: the
caller is a deterministic program whose source can be read, so "these calls are
always fine" is a claim someone can justify. A model gets no equivalent.

## Timeouts and the pending frame

A peer that is asking a human sends `CHANNEL_RPC_PENDING` **before** asking,
which stops the caller's timeout. Get this ordering wrong and any approval
slower than the timeout fails the call and then discards the decision when it
finally arrives.

The frame grants nothing. The call is still failed the moment the socket drops
— which is what actually happens when someone dies mid-prompt — and a peer that
sends it dishonestly can do nothing but keep its own call waiting.

**A refusal is sent as an answer**, so a denied call fails its command
immediately rather than hanging.

## Gotchas

- Arguments are validated before the send, so the request lands a tick after
  the call rather than in the same one. Tests that read a sent frame
  synchronously must await first.
- One connection has one transport, shared by every command on it: the first
  caller's timeout and validators are the connection's.
- The transport is created on first use and released when the channel closes,
  which is also what fails anything the departing peer still owed an answer to.
- A name with no declared contract is left alone by both validators — inventing
  a failure would break callers that deliberately treat the answer as opaque.
- A generated CLI client bootstraps no pikku state by design. That is why its
  version can drift from the server's, and why it is not shipped schemas.

## Where the code is

- `packages/core/src/wirings/channel/channel-rpc.ts` — frames, registry,
  transport, responder, validators, `resolveCapability`
- `packages/core/src/wirings/channel/channel-host-rpc.ts` — per-connection
  transport, `channelRemote`
- `packages/core/src/wirings/cli/channel/cli-approval.ts` — flags, terminal
  approver, mode → approver
- `e2e/tests/cli/channel-cli.test.ts` — both ends running against each other
