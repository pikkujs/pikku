---
'@pikku/cli': patch
---

Generate a `pikkuScenarioHook` factory alongside `pikkuScenario`. A hook is
never registered, so it had only a type — which left it the one scenario
primitive that could not be written inline without a type annotation, since
there was no call site for TypeScript to infer the services, input and wire
from. The factory returns its argument verbatim and exists purely to provide
that call site.
