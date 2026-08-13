---
'@pikku/knowledge': patch
'@pikku/console': patch
'@pikku/skills': patch
---

feat(knowledge): draw a note's scenario and its decision, and say the vocabulary exists

The console already drew ```mermaid fences as diagrams and `> [!NOTE]` blocks as
callouts, and nothing told the librarian either existed — the skill that governs
what goes in a note never mentioned them, so notes were written as prose and
tables into a renderer that would happily have drawn the graph. The gap was the
guidance, not the format.

Two blocks join them. A slice's ```gherkin scenario is drawn rather than
highlighted: the keywords line up in a column so the shape of the scenario is
readable before a word of it is, and each quoted persona becomes a chip — which
also makes a first-person scenario, the form the format rejects, visibly a block
with no personas in it.

A new ```decision fence states what a decision note owes: `chosen`, `rules-out`,
`because`. The middle one is the half that gets dropped, so `pikku knowledge
validate` now warns when a fence says what was chosen and never says what it
closes off. The fence is optional and a decision argued in prose is still a
decision — validate checks the fences that exist rather than asking every note
to be reformatted.

`Markdown` is exported from `@pikku/console` so the fabric console can render the
same notes through the same vocabulary instead of a second `<ReactMarkdown>`.
