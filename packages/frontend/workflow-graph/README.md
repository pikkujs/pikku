# @pikku/workflow-graph

Renders a Pikku workflow's meta as an interactive graph — layered left→right or
top→bottom via [ELK](https://github.com/kieler/elkjs), drawn with
[@xyflow/react](https://reactflow.dev), with a node type per workflow construct
(rpc, branch, switch, fanout, parallel, filter, sleep, return, cancel, set, …).

```tsx
import { WorkflowGraphView } from '@pikku/workflow-graph'
import '@xyflow/react/dist/style.css'

;<WorkflowGraphView workflow={workflowMeta} />
```

## Host integration

The graph knows nothing about the app around it. Everything it cannot derive
from the workflow meta comes in through one `host` prop:

```tsx
<WorkflowGraphView
  workflow={workflowMeta}
  direction="DOWN"
  host={{
    openFunction: (name) => …,
    openWorkflowStep: (stepId, stepType) => …,
    openChannel: (channelId) => …,
    focusedNodeId,
    referencedNodeId,
    getFunctionMeta: (name) => functionsMeta.find((f) => f.name === name),
    run: { runId, stepStates, status, wire },
  }}
/>
```

Pass `run` to paint a run over the graph: each step node takes its colour from
`stepStates.get(nodeId).status`, so the same component renders both a static
workflow definition and a live or historical run.

## Peer dependencies

`react`, `react-dom`, `@mantine/core`, `@pikku/mantine`, `@pikku/react` and
`@pikku/core`.
