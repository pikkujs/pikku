# Before you write an agent: ask

An agent names a model, and the model is the one decision in it that is not
yours to make. `provider/model` is a hard dependency on somebody's account,
credits and allow-list, and it fails at runtime rather than at build time — so
picking one silently is how an app ships pinned to a model its owner has no key
for. **Ask, then write.** One question, before the first agent file exists.

## The question

> Which model should this run on? I can use the Pikku Fabric gateway (nothing to
> set up), or point it at your own provider — tell me which and I'll wire the key.

Two answers, and they lead to different files.

### They are on the Pikku Fabric gateway

Nothing to set up: the gateway credentials are injected into the sandbox, so
there is no key to ask for and no `.env` line to add. **Default to
`gateway/luna`** unless they name something else — it is the cheap general
route and the right first choice for drafting, extraction and chat.

Do not tell them a key is missing. Do not raise a key-setup card. If a model
call fails here it is a routing or allow-list problem, not a missing credential,
and the fix is a different model string rather than a key.

### They are bringing their own provider

Ask which one, then wire exactly that provider into `providers` and read its key
through `secrets`/`variables` — never a literal. Name the model they actually
have access to; do not substitute a cheaper one you prefer.

## Do not pin a gateway model under a vendor's prefix

`providers` is public and mutable so deploy-time contributors can swap a
gateway-routed provider in after construction — and an exact entry always beats
`'*'`. So `openai/<a-model-only-the-gateway-serves>` works until the day
something registers a real `openai` provider, at which point every agent in the
app starts calling the vendor directly and gets `model does not exist`. It looks
like the gateway refusing a model; it is the gateway no longer being in the
call. Give a gateway model a prefix no vendor contributor will claim.

## Once it is written, say how to reach it

An agent is a front door, and a door nobody can find is not built. When the
agent is in place, tell them in the same breath **how to call it** — the exact
RPC, command or URL, written out. "The assistant is ready" is not an answer to
"how do I use this".
