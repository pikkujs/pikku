---
'@pikku/inspector': patch
---

Derive an addon's required parent services from what its functions actually use.

An addon's functions are its published surface — a consumer calls them, nothing
wires them locally — so `usedFunctions` was empty for an addon's own build and no
function services were ever aggregated. The generated services map came out
claiming the addon needed nothing beyond the framework defaults, and
`requiredParentServices` was derived only from the second parameter of
`pikkuAddonServices`, which names what the factory reads rather than what its
functions destructure.

The visible cost was an addon that consumed `kysely` in all fifteen of its
functions and declared it nowhere: the consuming project was never told to supply
it, the addon lost it at runtime, and every query failed on the first call. The
only way out was to list the missing names under `forceRequiredServices`, which
is a detection escape hatch and was never meant to carry a contract.

An addon build now aggregates services from every declared function, and treats
as parent-provided whatever it uses but does not build itself. What the factory
builds is read from the object literals it returns, minus anything it took off
the parent bag first — a forwarded service is not a created one, which is how
`@pikku/addon-admin` returns `scopeService` and friends without claiming to own
them. Names destructured from the second parameter in the function body, rather
than in the parameter list, are picked up too.
