---
'@pikku/console': patch
---

fix(nav-dock): the dock sits under the modal layer, not over it

Held open, the dock is full-width furniture across the foot of the window, and
it was drawn at z-index 300 — above Mantine's modal layer at 200. The shell
reserves the edge the dock takes, so the page itself never ran underneath it,
but a Drawer or Modal is portalled to the document and sized to the whole
window: its own footer landed in the dock's band and the dock took the click.
The roles drawer's Save button was dead, and so was anything else a dialog put
along its bottom edge. The dock now sits on Mantine's app layer, so a dialog
covers it the way a dialog covers every other piece of app chrome.
