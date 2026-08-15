---
type: slice
title: Browse the knowledge base
description: Reading the notes in the console, without being able to change them
status: built
entities: knowledge note
tags: knowledge, console
---

# Browse the knowledge base

The console shows this bundle: a navigator listing every note by section, and a
document view that renders one note's markdown with its links, tags, resources
and any findings against it.

> [!IMPORTANT]
> The page is **read-only by design**. A note is edited where it lives — in the
> repo, next to the code it describes, in the same commit — and a console that
> could rewrite it would be a second source of truth for a file that is already
> committed.

A note reaches the page without ever being written to a database:

```mermaid
flowchart LR
  file[knowledge/**.md] --> parse[Frontmatter + body]
  parse --> graph[Links resolved<br/>into a graph]
  graph --> validate[Findings]
  graph --> bundle([console:getKnowledge])
  validate --> bundle
  bundle --> page[Knowledge page]
```

What the document view draws, and where each part comes from:

| On the page | Comes from                 | Rendered as                         |
| ----------- | -------------------------- | ----------------------------------- |
| Title       | `title:`                   | The document heading                |
| Kind        | `type:`                    | An icon and a badge                 |
| Resources   | `resource:`                | Chips linking into the console      |
| Links       | markdown links             | A move to the note, within the page |
| Findings    | `pikku knowledge validate` | A line per problem, on the note     |

```gherkin
Scenario: An operator finds a note and reads it
  Given 'admin' opens the knowledge page in the console
  Then 'admin' sees the notes grouped by section
  When 'admin' opens the slice called Read a report
  Then 'admin' sees its scenario in the document

Scenario: A consistent base reports nothing to fix
  Given 'admin' opens the knowledge page in the console
  Then 'admin' sees no issues to fix
```

The findings the second scenario asserts on are the ones
`pikku knowledge validate` produces, so the page and the CI gate cannot disagree
about whether the base is consistent.
