# n8n-import coverage harness

The harness runs a corpus of real n8n workflow JSON exports through
`parseN8n → generateWorkflowFromN8n → tsc` and classifies each workflow. It is
the acceptance-criterion evidence for `@pikku/n8n-import`: proof of what imports
cleanly across the wild n8n ecosystem, and where the gaps are.

## Running it

```bash
yarn harness                 # pinned fixtures/ — the CI gate (must be 0 failed)
yarn harness --dir <path>    # any folder of .json workflow exports
yarn harness --full          # the gitignored full corpus at ./.corpus (or $N8N_CORPUS_DIR)
yarn harness --limit 500     # cap how many are processed
yarn harness --keep          # keep the emitted tsc project for inspection
```

Each run writes `harness-report.json` (machine-readable) and
`harness-report.md` (human-readable). Both are gitignored — this file snapshots
the headline result.

## What "pass" means

- **clean** — emits files and `tsc` passes, with no stub functions. Rare in
  practice: virtually every real workflow touches at least one integration.
- **partial** — emits files and `tsc` passes, but the emit contains throwing
  stub functions (integrations, Code nodes, control nodes, RAG) that a human or
  the downstream `pikku-n8n-addon-map` / `pikku-n8n-code-translate` skills must
  implement. This is the expected steady state.
- **failed** — `parseN8n` threw, codegen threw, an empty emit, or the generated
  TypeScript did not compile.

The `tsc` pass verifies the emitted TypeScript is structurally sound against a
shimmed `#pikku` surface (`harness/shim`). It catches broken emits — bad
identifiers, wrong arity, malformed literals, dangling refs, unterminated
comments — not semantic mismatches with a project's real generated types.

## Result — Zie619/n8n-workflows (2,061 workflows)

| Outcome | Count |      % |
| ------- | ----: | -----: |
| clean   |     0 |   0.0% |
| partial |  2061 | 100.0% |
| failed  |     0 |   0.0% |

**100% of the corpus imports and type-checks.** Every workflow produces a
compiling Pikku scaffold; none fail to parse, generate, or compile. All land in
`partial` because every one contains at least one stub to implement — that is
the honest hand-off boundary, not a defect.

Across 29k+ nodes (415 distinct node types): **18,783 stubbed**, **2,536
supported** (Set/assembly + agents), **2,395 skipped** (triggers + absorbed AI
sub-nodes: models, memory, output parsers).

### Top node types by corpus frequency

| node type       | count | status    |
| --------------- | ----: | --------- |
| noOp            |  4380 | stubbed   |
| set             |  2536 | supported |
| httpRequest     |  2128 | stubbed   |
| stopAndError    |  1103 | stubbed   |
| if              |  1096 | stubbed   |
| code            |  1005 | stubbed   |
| manualTrigger   |   927 | skipped   |
| googleSheets    |   597 | stubbed   |
| merge           |   487 | stubbed   |
| splitOut        |   405 | stubbed   |
| telegram        |   390 | stubbed   |
| webhook         |   351 | skipped   |
| scheduleTrigger |   330 | skipped   |
| switch          |   300 | stubbed   |
| googleDrive     |   290 | stubbed   |

The long tail is real: 415 distinct types, but a handful (noOp, httpRequest,
Code, Google Sheets, the IF/Switch/Merge control family) dominate. That ranking
is where addon-mapping and control-flow effort pays off first.
