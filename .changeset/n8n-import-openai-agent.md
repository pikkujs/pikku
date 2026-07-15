---
'@pikku/n8n-import': patch
---

Map the base n8n `openAi` node's text/chat/completion path onto a tools-less
`pikkuAIAgent`, reusing the existing chain→agent machinery. The model is read
inline from the node's own `model`/`modelId` parameter (the `openAi` node
carries its model directly, unlike a LangChain chat-model sub-node), and the
goal is built from the prompt / chat messages / edit instruction. Image, audio,
assistant, and file resources stay deferred stubs. This replaces the previous
`openai:chatComplete` addon mapping (which needed a nonexistent
`@pikku/addon-openai`) for text/chat nodes, moving corpus clean coverage from
964 → 973.
