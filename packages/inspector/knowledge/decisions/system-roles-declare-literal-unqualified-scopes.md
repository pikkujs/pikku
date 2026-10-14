---
type: decision
title: System roles must declare literal, unqualified scopes
description: A system role needs a literal scopes array of string literals, and its name may not contain the scope separator
tags: [inspector, roles, scopes]
---

# System roles must declare literal, unqualified scopes

`addSystemRole` in `packages/inspector/src/add/add-system-role.ts` applies these rules
to each `defineSystemRole` entry:

- `scopes` must be present and must be an array literal. A missing or non-literal
  `scopes` is reported as critical and the role is dropped (lines 37-54, and the
  skip at 143-146). The message asks for `scopes: []` when a role grants nothing
  (line 40).
- Each element of `scopes` must be a string literal. A non-literal element is
  reported as critical and skipped (lines 57-66). The reason given is that scopes
  are read by AST, so a computed value cannot be checked (line 63).
- A role name containing `:` is refused (lines 126-133), because `:` delimits scope
  ids and "a role named like a scope reads as one" (line 130).
- An empty role name is refused (lines 118-124).

The doc comment on `extractScopes` (lines 20-23) says the empty array and the
absent property are kept distinct on purpose.

**What this rules out:** a role whose scopes cannot be checked statically, and a
role name that looks like a scope id.
