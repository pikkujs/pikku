---
'@pikku/skills': patch
---

pikku-agent: ask which provider and model before writing an agent

An agent's `provider/model` string is a hard dependency on somebody's account,
credits and allow-list, and it fails at runtime rather than at build time — so
choosing one silently ships an app pinned to a model its owner may have no key
for. Adds `prompt.md` with the question to ask first, the Fabric-gateway default
(`gateway/luna`, nothing to set up), the bring-your-own-provider path, and why a
gateway model must not be pinned under a vendor's prefix.
