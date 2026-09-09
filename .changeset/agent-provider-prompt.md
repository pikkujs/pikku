---
'@pikku/skills': patch
---

pikku-agent: ask which provider and model before writing an agent

An agent's `provider/model` string is a hard dependency on somebody's account,
credits and allow-list, and it fails at runtime rather than at build time — so
choosing one silently ships an app pinned to a model its owner may have no key
for. Adds `prompt.md` with the question to ask first, the Fabric-gateway default
(`openai/gpt-5.6-luna` on the injected LiteLLM proxy, nothing to set up), the
bring-your-own-provider path, and why the prefix chosen is a claim on that
vendor's name that a later BYO key will take back.
