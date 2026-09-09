# Before you write an agent: ask

An agent names a model, and the model is the one decision in it that is not
yours to make. `provider/model` is a hard dependency on somebody's account,
credits and allow-list, and it fails at runtime rather than at build time — so
picking one silently is how an app ships pinned to a model its owner has no key
for. **Ask, then write.** One question, before the first agent file exists.

## The question

> Which model should this run on? If you're on a gateway I can use its default
> and there's nothing to set up — otherwise tell me the provider and I'll wire
> the key.

Two answers, and they lead to different files.

### They are on a gateway

A gateway is one provider entry that accepts many model names, so there is no
per-vendor key to ask for. Pikku Fabric injects one: it points `openai`,
`anthropic`, `gemini`, `deepseek` and `zai` at a LiteLLM proxy, and the cheap
general route is **`openai/gpt-5.6-luna`** — use it unless they name something
else. It is the right first choice for drafting, extraction and chat.

Read that prefix correctly: `openai/` here selects **the gateway**, not OpenAI,
and `gpt-5.6-luna` is a name the gateway serves rather than a vendor model. A
bare alias with no slash throws.

Do not tell them a key is missing, and do not raise a key-setup card. On an
injected gateway the credentials are already there — a failing call is a routing
or allow-list problem, and the fix is a different model string, not a key.

### They are bringing their own provider

Ask which one, wire exactly that provider into `providers`, and read its key
through `secrets`/`variables` — never a literal. Name a model they actually have
access to; do not substitute a cheaper one you prefer.

## The prefix you pick is a claim on that vendor's name

`providers` is public and mutable so deploy-time contributors can swap providers
in after construction, and an exact entry always beats `'*'`. So a gateway model
named `openai/…` keeps working only while nothing registers a real `openai`
provider — and adding an OpenAI key to the app is exactly what does that. From
then on every agent under that prefix calls the vendor directly and gets
`model does not exist`, which reads like the gateway refusing a model when it is
really the gateway no longer being in the call.

There is no prefix that is safe in the abstract, so make it a question rather
than a guess: if they are likely to bring their own OpenAI or Anthropic key
later, put the gateway models under one of its other names (`zai/`, `deepseek/`,
`gemini/`) and leave `openai/` free for the key they will add.

## Once it is written, say how to reach it

An agent is a front door, and a door nobody can find is not built. When the
agent is in place, tell them in the same breath **how to call it** — the exact
RPC, command or URL, written out. "The assistant is ready" is not an answer to
"how do I use this".
