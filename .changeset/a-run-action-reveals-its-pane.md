---
'@pikku/console': patch
---

A run action now re-opens the details pane it renders into. The new-run button and run selection both put their result in that pane, whose collapsed state is remembered in `localStorage` — so once it had been collapsed, the new-run button flipped state into a 40px stub and looked dead, with no error and no feedback, across reloads. Selecting a run had the same defect, masked by the graph beside it also changing.

The layout now hands its list pane a reveal, the mirror of the collapse control that pane already provides for itself.
