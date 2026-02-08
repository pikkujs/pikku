# Inspector Package Optimization Plan

## Context

The inspector (`packages/inspector/src/`) is a static code analyzer built on TypeScript's compiler API. It extracts metadata from source files via a two-pass AST visitor pattern (setup + routes). Profiling reveals that for **every AST node**, all handlers are called sequentially (10 in setup, 16 in routes) even though only 1 ever matches. This creates millions of wasted function calls on large codebases.

The inspector already has `performance.now()` instrumentation for 7 phases. We'll use this to measure each optimization independently.

---

## Step 0: Create Benchmark Harness

**Goal:** Establish reproducible baseline measurements.

**File:** `src/benchmark.ts`

**What it does:**

- Collects `.ts` files from a target directory (e.g., the external repo's packages)
- Runs `inspect()` N iterations (default 10) with a warmup run
- Parses existing `logger.debug` messages to capture per-phase timings
- Reports median, mean, min, max for each phase + total
- Outputs JSON for before/after diffing
- Also benchmarks `filterInspectorState()` separately using the test fixture (`src/utils/test-data/inspector-state.json`)
- Adds counters for: total AST nodes visited, CallExpression nodes, dispatch hits

**Run with:**

```bash
node --import tsx src/benchmark.ts <target-dir> <iterations>
```

**How to verify:** Run 3x, confirm <5% variance between runs for each phase.

---

## Step 1: Identifier-Based Dispatch Map in `visit.ts`

**File:** `src/visit.ts`

**Problem:** Every AST node goes through ALL handlers. In `visitRoutes`, that's 16 function calls per node. Each handler independently checks `isCallExpression` -> `isIdentifier` -> `expression.text === 'xyz'`. For non-CallExpression nodes (the vast majority), all 16 calls are wasted.

**Fix:** Check node kind once, extract identifier once, use `Map<string, handler>` for O(1) dispatch.

**Dispatch map for `visitRoutes`** (all handlers expect CallExpression + Identifier):

| Identifier             | Handler               |
| ---------------------- | --------------------- |
| `wireHTTP`             | `addHTTPRoute`        |
| `wireHTTPRoutes`       | `addHTTPRoutes`       |
| `wireScheduler`        | `addSchedule`         |
| `wireTrigger`          | `addTrigger`          |
| `wireTriggerSource`    | `addTrigger`          |
| `wireQueueWorker`      | `addQueueWorker`      |
| `wireChannel`          | `addChannel`          |
| `wireCLI`              | `addCLI`              |
| `pikkuCLIRender`       | `addCLIRenderers`     |
| `wireMCPResource`      | `addMCPResource`      |
| `wireMCPTool`          | `addMCPTool`          |
| `wireMCPPrompt`        | `addMCPPrompt`        |
| `wireWorkflowGraph`    | `addWorkflowGraph`    |
| `wireSecret`           | `addSecret`           |
| `wireOAuth2Credential` | `addOAuth2Credential` |
| `wireVariable`         | `addVariable`         |

Fallback for unmatched identifiers: check `/pikku.*func/i` regex -> `addFunctions`.

**Dispatch for `visitSetup`** (mixed node kinds):

- `SyntaxKind.CallExpression` + Identifier -> map with: `external`, `workflow`, `workflowStart`, `workflowRun`, `workflowStatus`, `graphStart` -> `addRPCInvocations`; `pikkuMiddleware`, `pikkuMiddlewareFactory`, `addMiddleware`, `addHTTPMiddleware` -> `addMiddleware`; `pikkuPermission`, `pikkuPermissionFactory`, `addPermission`, `addHTTPPermission` -> `addPermission`; `pikkuWorkflowFunc`, `pikkuWorkflowComplexFunc` -> `addWorkflow`
- `SyntaxKind.CallExpression` + PropertyAccessExpression (`rpc.invoke`) -> `addRPCInvocations`
- `SyntaxKind.ClassDeclaration` / `InterfaceDeclaration` -> `addFileExtendsCoreType` (4 core type names)
- `SyntaxKind.VariableDeclaration` -> `addFileWithFactory` (3 factory type names)
- All other node kinds -> skip directly to recursion

**Measure:** Compare "Visit setup phase" and "Visit routes phase" benchmark timings.

**Expected improvement:** 30-60% reduction in visit phase times.

**Verify:** `bash run-tests.sh` + compare serialized inspector state output before/after.

---

## Step 2: Hoist Regex + Remove Redundant Checks in `add-functions.ts`

**File:** `src/add/add-functions.ts`

**Problem (lines 290-309):**

```ts
// Line 301: regex re-created EVERY call (every AST node)
const pikkuFuncPattern = /pikku.*func/i
// Line 307: redundant - isIdentifier already checked at line 296,
// startsWith('pikku') is a subset of the regex
if (!ts.isIdentifier(expression) || !expression.text.startsWith('pikku'))
```

**Fix:**

1. Move `const pikkuFuncPattern = /pikku.*func/i` to module scope
2. Remove the redundant check at line 307-309

**Measure:** "Visit routes phase" timing.

**Expected improvement:** 1-5% of visit routes phase.

**Verify:** `bash run-tests.sh`

---

## Step 3: Replace `getText()` with `.text` Property Access

**Files:** 3-5 files, ~8 safe replacements

`node.getText()` reconstructs text by slicing the source string. For `Identifier` nodes, `.text` is a direct property -- zero overhead.

**Safe replacements:**

- `src/add/add-file-extends-core-type.ts` line 13: `node.name?.getText()` -> `node.name?.text`
- `src/add/add-file-with-factory.ts` line 24: `node.name.getText()` -> guard with `ts.isIdentifier(node.name) ? node.name.text : node.name.getText()`
- `src/add/add-channel.ts` line 360: `shorthandDecl.name.getText()` -> `.text` (ImportSpecifier name is always Identifier)

**Skip** (not safe or rarely hit): error messages, template literals, TypeNode, QualifiedName.

**Measure:** "Visit setup phase" + "Visit routes phase" timings.

**Expected improvement:** 1-3% of visit phases.

**Verify:** `bash run-tests.sh`

---

## Step 4: Replace `JSON.parse(JSON.stringify(...))` with `structuredClone()`

**File:** `src/utils/filter-inspector-state.ts` (lines 198-233)

**Problem:** 8 calls to `JSON.parse(JSON.stringify(...))` for deep cloning metadata objects. This serializes to string then parses back -- wasteful.

**Fix:** Replace all 8 with `structuredClone()` (available Node 17+, package requires >=18).

```ts
// Before
meta: JSON.parse(JSON.stringify(state.http.meta))
// After
meta: structuredClone(state.http.meta)
```

**Measure:** Separate `filterInspectorState` benchmark loop using the 45KB test fixture.

**Expected improvement:** 10-30% of filter phase time (not the main inspect path, but important for CLI).

**Verify:** `bash run-tests.sh` (filter-inspector-state.test.ts covers this extensively -- 1,440 lines of tests).

---

## Step 5: Cache `node.getSourceFile().fileName` in Hot Handlers

**Files:** Primarily `src/add/add-functions.ts`

**Problem:** `add-functions.ts` calls `node.getSourceFile().fileName` 4+ times within a single handler invocation for the same node (lines 666, 700, 721, 735). `getSourceFile()` walks the parent chain each time.

**Fix:** Extract once at handler entry:

```ts
const sourceFileName = node.getSourceFile().fileName
```

Then reuse `sourceFileName` throughout.

**Measure:** "Visit routes phase" timing.

**Expected improvement:** 1-2%.

**Verify:** `bash run-tests.sh`

---

## Summary

| Step | Change            | File(s)                     | Expected Impact            | Metric               |
| ---- | ----------------- | --------------------------- | -------------------------- | -------------------- |
| 0    | Benchmark harness | New `benchmark.ts`          | Baseline                   | -                    |
| 1    | Dispatch map      | `visit.ts`                  | **30-60%** of visit phases | Visit setup + routes |
| 2    | Hoist regex       | `add-functions.ts`          | 1-5% of visit routes       | Visit routes         |
| 3    | getText -> .text  | 3-5 files                   | 1-3% of visit phases       | Visit setup + routes |
| 4    | structuredClone   | `filter-inspector-state.ts` | 10-30% of filter phase     | Filter benchmark     |
| 5    | Cache sourceFile  | `add-functions.ts`          | 1-2% of visit routes       | Visit routes         |

## Verification

After each step:

1. Run benchmark: `node --import tsx src/benchmark.ts <target> 10`
2. Run tests: `cd packages/inspector && bash run-tests.sh`
3. Compare serialized inspector state output (before vs after) to confirm identical results
