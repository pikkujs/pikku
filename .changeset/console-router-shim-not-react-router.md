---
'@pikku/console': patch
---

`FunctionsPage` and `VirtualUserDocument` imported `useSearchParams` and `Link`
straight from `react-router` instead of the console's own router shim. The
console is router-agnostic — every other page goes through `../router`, which
the host fills via an adapter — so in a host running anything else (TanStack
Router, for one) those two components threw `useLocation() may be used only in
the context of a <Router>` and took the whole shell down with them, since the
host's error boundary catches the render, not just the route.
