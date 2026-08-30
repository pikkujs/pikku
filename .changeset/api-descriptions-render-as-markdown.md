---
'@pikku/console': patch
---

Render a package or API description as markdown in the detail panel.

Every apis.guru entry ships a full markdown document as its description —
headings, links, fenced curl examples — and the console printed it into a
single `<Text>`. Newlines collapse, so an Adyen or Stripe entry read as one
unbroken paragraph with `##` and `[label](url)` inline, which is most of the
catalogue now that it is populated.

`AddonDetail` and the API modal in `PackageDetailPage` both use the existing
`<Markdown>` component, so these descriptions get the same headings, links and
code surfaces as a package README. Addon descriptions are one-liners and render
identically to before.
