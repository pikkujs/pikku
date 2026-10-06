---
'@pikku/cli': minor
---

Add `pikku mocks diff`. Mock data for an RPC lives in `.mocks/<rpc.name>/<mock>.json`, with `<mock>.meta.json` beside it for the label, state (healthy, empty, error, slow), default, delay and status. The command validates each mock against the function's output schema, compares the shape the mocks agree on with the shape the function returns, and reports every RPC as added (mocked, no function), changed (a field added, removed or retyped) or ok, with warnings for a missing default, a mock without meta, or no empty or error scenario. It exits non-zero on anything but ok. `--all` also lists functions with no mock.
