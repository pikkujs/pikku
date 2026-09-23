---
'@pikku/skills': patch
---

`pikku-react` documents continuous input: a slider bound to query data that mutates on every `onChange` sends a request per drag tick and snaps back under the finger on each refetch. The skill and the react-query reference now show the local-state + settle pattern, and the optimistic `onMutate` shape for tapped controls.
