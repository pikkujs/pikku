---
type: overview
title: Decisions
description: Rules chosen in inspector-rust, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [A Rust inspector ships beside Go; Go is the oracle and parity is the exit criterion](rust-inspector-beside-go.md) — pikku-inspect-rs on tsrs speaks the Go protocol, is selectable, and becomes the default only when the parity harness shows byte-identical output
- [The committed Go goldens stay, and CI checks them against Go](committed-go-goldens-are-checked-against-go.md) — three fixtures keep a stored slice of Go's output so cargo test needs no Go; golden-check.ts regenerates them from Go and fails when one is stale

<!-- /pikku:knowledge-index -->
