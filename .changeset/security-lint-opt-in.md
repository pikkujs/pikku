---
'@pikku/inspector': patch
'@pikku/cli': patch
---

perf(cli,inspector): make the data-classification scan opt-in (`pikku all --security`)

`pikku all` was spending the bulk of its wall-clock on the data-classification
leak check. For every function, on every inspector pass, it called
`checker.getReturnTypeOfSignature` to infer the handler's return type and scan it
for `Private`/`Pii`/`Secret` brands — the single most expensive type-checker
operation. On a 331-function project that was ~7.3s (≈half the total), repeated
across all three inspector passes, even though the scan only emits diagnostics
and never affects generated output.

The scan is a security lint, not codegen, so it's now **off by default** and gated
behind a new `--security` flag (or `security: true` in the config). A plain
`pikku all` skips return-type inference entirely; run `pikku all --security`
(optionally with `--fail-on-error`) in CI/pre-deploy to enforce it. On the
331-function project this cut `pikku all` from ~15.3s to ~9.6s.

Also: the `all` command now reads back the run's recorded per-step durations and,
under `PIKKU_TIMING=1`, prints a slowest-first timing table — making it easy to
see where codegen time goes without adding any hot-path instrumentation.
