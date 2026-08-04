---
'@pikku/console': patch
'@pikku/knowledge': patch
---

A knowledge note now renders as a document rather than as a wall of markdown,
and the things it names are links into the app.

The console's markdown renderer gains the parts of markdown that carry structure
rather than prose. ```mermaid fences are drawn as diagrams, lazily — mermaid is
~1MB of parser and layout engine, imported on the first fence that needs one, so
a note without a diagram never pays for it. The diagram is themed from the
console's own CSS variables read off the live element, which is what makes one
diagram look native in both colour schemes and inside a host console that
supplies its own values for the same tokens. Only diagrams of STRUCTURE are
drawn — flowchart, sequence, state, ER, class, journey, timeline, mindmap,
gitGraph. Mermaid also renders charts, and those deliberately degrade to their
own source: a chart spends the reader's screen on a handful of numbers a sentence
carries better, and puts the loudest typography on the page around the least
important content. A fence that does not parse degrades the same way, with a line
saying so — notes are written by agents and by people, and a diagram that fails
silently is worse than one that shows its working.

`> [!NOTE]`-style callouts (note, tip, important, warning, caution) render as
callouts, fenced code is syntax-highlighted and copyable in one action, headings
carry ids so a note can be linked to below its title, and both wide tables and
wide diagrams keep their intrinsic size inside a focusable, labelled region that
fades at whichever edge still has content behind it. Scrolling rather than
scaling, because a fitted diagram keeps its aspect ratio by shrinking its type
with it, and a flowchart in a narrow pane arrives as an unreadable strip.

`resource:` URIs are now links. A note that says `func:createEntry` renders it as
a chip that opens the function, and the same scheme works inline, so a sentence
can name `[getReport](func:getReport)` and have the reader arrive at it. Standing
alone the chip shows the whole URI — the kind is half of what it says; inline it
shows the author's words and drops the box, because a boxed word every few words
stops a sentence dead. The screens those links land on (functions, workflows,
wires, jobs, scopes) now seed their search box from `?search=`, which is what
turns a link into a landing.

Two prefixes join the scheme in `@pikku/knowledge`: `scope:`, which resolves
against the permission a function gates itself with and the roles that confer it,
and `persona:`, against `definePersonas()`. Both are declarations the generated
meta can check, which is the whole bar for a prefix — a reference nothing
validates rots into fiction exactly where it looks most authoritative.
