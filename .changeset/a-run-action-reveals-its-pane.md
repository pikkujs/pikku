---
'@pikku/console': patch
---

A run action now re-opens the details surface it renders into. The new-run button and run selection both put their result there, and it can be gone two different ways — collapsed, or closed outright — so the button flipped state with nothing on screen moving, with no error and no feedback.

Collapsed is the `ThreePaneLayout` case: the pane's state is remembered in `localStorage`, so once collapsed the button looked dead across reloads. The layout now hands its content a reveal, the mirror of the collapse control that pane already provides for itself.

Closed is the `ResizablePanelLayout` case, which the workflow screen uses: activating a panel id that is no longer open does nothing, so the on-screen run controls now open the workflow panel rather than merely activating it.

The workflow screen also grows its own run controls. Starting a run was only reachable through the details panel; the action now sits above the graph, with the selected run's id and status beside it.
