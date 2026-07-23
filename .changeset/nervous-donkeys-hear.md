---
'@pikku/console': patch
---

Let a read-only console browse the addon catalogue

A read-only console (`editable={false}`, e.g. a deployed stage) locked the addons
view to the `installed` filter and hid the filter control entirely, so the tab
rendered an empty gallery with no way to reach the catalogue. Read-only means you
cannot *install* — the catalogue is still worth browsing. The filter now applies
as chosen and its control always renders; install actions stay gated on
`editable` in the detail drawer, as before.
