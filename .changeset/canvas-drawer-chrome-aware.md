---
'@pikku/console': patch
---

Let a host render the canvas add-step surface as its own panel.

`WorkflowCanvasDrawer` is an overlay pinned to the viewport, which is right when
the console owns the window and wrong when it is one card inside a host's page:
there it floated over the host's own chrome and ignored the end-edge panel the
host already has.

Under `HostConsoleChrome` it now renders nothing itself and mirrors the canvas
state into the panel context as `openPanel('workflowCanvas', …)`, so the host
draws it wherever it puts panels; closing that panel clears the canvas state, so
the affordance that opened it still works on the next click. Standalone is
unchanged — same overlay, same content.

The content moves safely because it is a pure catalogue: local view state and
app-level RPC metadata only, nothing provided inside the page it is leaving.
