---
'@pikku/cucumber': patch
---

createFunctionWorld accepts cucumber's real World class: the constructor param was typed `new (options: unknown) => object`, which contravariantly rejected `typeof World` (its constructor takes IWorldOptions). Now `new (options: any) => object`.
