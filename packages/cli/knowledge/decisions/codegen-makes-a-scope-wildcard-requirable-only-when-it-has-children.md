---
type: decision
title: Codegen makes a wildcard requirable only for a scope that has children, and never the bare star
description: The generated ScopeId union adds scope:* only for scopes with descendants and never emits a bare *, so a leaf's wildcard is not a requirement type
tags: cli, scopes, codegen
---

# Codegen makes a wildcard requirable only for a scope that has children, and never the bare star

`serializeScopesTypes` writes the `ScopeId` union (`packages/cli/src/functions/wirings/scopes/serialize-scopes-types.ts:19`). Every declared id is a member (`:28-29`). A wildcard form is added only for ids that have a descendant. `hasChildren` looks for an id that starts with `${id}:` (`:25-26`), and `ids.filter(hasChildren).map((id) => \`${id}:*\`)` (`:30`) is the only place a wildcard is produced. A bare `*` is never produced.

The doc comment gives the rule and its reason: `admin:*` is requirable when `admin` has children, and a leaf's wildcard "would grant nothing beyond the leaf itself, so it is omitted" (`:13-17`). The generated type comment says a `:*` entry requires the scope and all of its descendants (`:59-61`).

This is codegen only. How a held grant satisfies a requirement is a runtime question, which this note does not cover.

**What this rules out:** a bare `*` in the generated `ScopeId` union, and a wildcard requirement on a leaf scope.
