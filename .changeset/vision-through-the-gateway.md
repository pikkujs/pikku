---
'@pikku/skills': patch
---

Two things an agent building a vision feature had to discover by reading source. **pikku-agent** now documents `attachments`: the `data`/`url` split, that a `url` is downloaded server-side (so a caller-supplied one is an SSRF surface the runner's host allowlist exists for), that the model id — not the provider prefix — decides whether an image is read at all, and that reading a picture into typed data is the tool-free case `output` was waiting for. **pikku-fabric** gains "Reaching a model": `pikku dev` builds the `agentRunner` from a matching `OPENAI_BASE_URL`/`OPENAI_API_KEY` or `LITELLM_PROXY_URL`/`LITELLM_API_KEY` pair and otherwise 503s every agent with `AIProviderNotConfiguredError`, and `pikku fabric llm key --env` is the one command that fills either pair in from the Fabric AI gateway.
