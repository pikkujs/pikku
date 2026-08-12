---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/ai-vercel': patch
---

Name models by what they are for, and switch them all in one place

A `models` table in pikku.config.json maps an alias to a provider-qualified
model, so a declaration can say `model: 'cheap'` and the project repoints every
use of that tier at once instead of editing each agent. A model containing `/`
is still concrete and used exactly as written, which is how an agent that needs
one specific model pins it — aliases are opt-in.

The table is baked into codegen rather than read at runtime, so it applies to
deployed units and not just local runs, and `pikku dev`/`pikku serve` take
`--model cheap:openai/gpt-5-nano` to repoint a tier for one run without editing
the config.

Because the inspector already holds every agent's model literal, a bare name
with no matching alias now fails the build (PKU146) naming the aliases that do
exist, rather than reaching a provider as an unknown model.

Aliases resolve for every modality, not just agents: image, speech,
transcription, embedding and reranking all reach a provider through the same
point in the Vercel runner.
