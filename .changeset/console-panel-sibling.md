---
'@pikku/console': patch
---

Let an embedding host own the console's card and detail panel.

`HostConsoleChrome` marks a console screen as living inside a host that already
puts every page in its own card and has its own end-edge panel (Fabric). Under
it, a screen's outermost list surface renders flush instead of painting a second
card inside the host's one, `ResizablePanelLayout` drops the page padding the
host already supplies, and it stops docking the detail panel as a column — the
host mounts `PanelProvider` and renders `PanelContainer` beside the page, so the
panel opens on the end edge like every other panel in the host.

Nothing changes for the standalone console, which stays on the default `self`
chrome.
