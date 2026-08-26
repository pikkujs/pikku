---
'@pikku/cli': patch
---

fabric validate: stop the scenario copy scan reporting asserted values as UI copy.

`expect(item.unit, 'kg', 'the item unit')` compares a value an RPC returned.
The scan matched the literal against the message catalogue and reported it as
hardcoded copy that should be read from `unit_kg` — a fix that would bind a
stored value to a form label, so the assertion would then pass against whatever
the label happened to say.

A literal passed directly to `expect(...)` is no longer scanned. A locator
nested inside one still is: in `expect(await page.getByText('Save').count(), 1)`
the literal belongs to `getByText`.
