---
'@pikku/console': patch
'@pikku/addon-console': patch
---

Reach the whole console from ⌘K, and report a name collision as a conflict.

The command palette now lists every page in the navigation and, for anyone who
can impersonate, the impersonation picker — so both are reachable without the
chrome, which is a dock that only raises on hover at pointer widths and a closed
sheet on a phone. Its shortcut no longer goes dead while a text field has focus,
which is when reaching for the palette is most likely.

Installing an addon under a name the project already wires now reports a
conflict rather than a 500: the check asks the registry what is wired, so an
instance wired from outside the addons directory is found too.

A gherkin line in the knowledge viewer keeps a space between its keyword and the
sentence, so the line reads as a sentence to anything reading the DOM rather
than the layout.
