---
'@pikku/console': patch
---

A metadata refresh no longer blanks the console. `AppLayout` gated its
full-screen loader on `loading`, which a refresh raises just as the first load
does, so the dock's Refresh tile threw the user back to a spinner and then to
the page's initial state. It now gates on `initialLoading` — loading with
nothing to show yet — and a refresh keeps the page it was on, with only the
control that asked for it reading as busy.
