---
'@pikku/console': patch
---

Let an embedding host supply the loading mark.

Every page-level spinner in the console was a bare Mantine `<Loader />` centred
in the screen — 30-odd copies of the same block. A host that embeds the console
inside its own product (Fabric) has a loading mark of its own, and a Mantine
ring in the middle of an otherwise branded page is the one place the embedded
screen stops looking like the rest of that product.

Those sites now render `ConsoleLoading`, which shows the host's mark when there
is one and the Mantine loader when the console stands alone. The host supplies
it once, as `HostConsoleChrome`'s new optional `loader` prop, rather than every
screen taking a prop for it. Nothing changes for the standalone console.
