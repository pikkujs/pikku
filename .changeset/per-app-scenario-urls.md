---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

A persona can name the `app` they sign into, and a browser run takes a url per app (`--app-url <app>=<url>`, or `appUrls` on the environment). Each actor's browser context navigates against its own app's base, so a product that is more than one frontend can be proved in one run — including a scenario that crosses from one app to the other. A run whose personas name an app nobody gave a url for is refused rather than browsing the wrong app's pages.
