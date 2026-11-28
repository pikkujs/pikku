# Planning from the notes (a clone or a conversion)

A brief that names a site is planned from what the site holds, not from its address. The notes in `knowledge/site/` come first (`index.md` first, then the rest). Then file the plan from them, with the general
rules of the `pikku-changes` skill, and these on top:

- The data change stores what `things-kept.md` and `forms.md` say, in the currency and languages `prices-and-languages.md` says,
  and the plan covers every form and page you found. The content the owner changes over time (events, prices and offers,
  testimonials, articles, sections they update) is records in tables the data change creates (its body names them), seeded
  with the original's content and read by the pages; never a catalogue written into code. Wording that does not change
  (menu labels, buttons, footer) stays in the i18n messages.
- An owner area in the same app: a `frontend` change with `"newPages": ["/admin", ...]` where the signed-in owner lists,
  adds, edits and removes those records and reads what the forms sent. It depends on the data change. Never a separate app.
  Those records, and what the forms sent, use the collection backend, within the limits in `pikku-changes`: the data change
  declares them in `db/collections.ts`, and the `/admin` pages are built to call the generated functions. The functions the
  public forms submit to are hand-written.
- The rebuilt site does what the original does, no more. A route, form, table or email comes from the capture: an original
  page, form or redirect, an email the original visibly sends or promises, the owner area, or the data of a service being
  replaced. Anything seen only in policy or legal text, or implied by a service's name (a newsletter the privacy policy
  mentions, an email a booking tool may send), is an "Open question: ..." in the nearest change, never a change, route,
  table or email of its own.
- Every change body ends with `Evidence:` and one line per feature it plans (a route, form field, table, outside-service
  decision, interaction): `- <feature>: <source>`, where the source is `page:<id>` (a captured page), `behaviour:<key>`
  (a key of `behaviour.json`, such as `forms[0].fields`, `outsideHosts.<host>`, `interactions`, `redirects`),
  `note:<file in knowledge/site/>` or a captured URL. A route, form field, table, outside-service decision or interaction
  needs a primary source where the capture has one: `page:`, `behaviour:` or a captured URL. A `note:` may be added as
  context, never alone. A form or flow inside an embedded service (a booking tool, a hosted form) is evidenced by
  `behaviour:frames` (its choices, forms, fields and hosts), and the first step of a flow behind a link or button (a hosted
  form, a checkout, a sign-in) by `behaviour:actions`; a page fetched with curl is not evidence. A member or sign-in area is
  an original feature only where `actions` shows its step; later steps the capture did not reach are open questions. A feature with no
  source is not planned: it is an "Open question: ..." in the nearest change.
- Every service in `outside-services.md` and every host in `behaviour.json` `outsideHosts` is named by a change: one that
  replaces it (a hosted form becomes the app's own form and table, a tracker or error reporter is removed, fonts and pictures
  are served by the app, the page builder's hosting is the rebuilt app), or one that keeps it, in the body of the change that
  links to it: "Decision: keep <service>: <why>". Before filing, check each one against the plan's bodies.
- The site's own sub-domains and sibling apps are planned only as the person answered when asked (the site study's step 4):
  one left out is a link and an "Open question: ..." in the change that links to it.
- A checkout, booking or payment the original runs on a hosted service (a shop's cart and checkout, a booking tool, a
  subscription) stays in place, linked from the rebuilt pages, until the person confirms what replaces it (the payment
  processor, its account and its rules): the plan says so as "Decision: keep <service> until ..." and an "Open question: ..."
  for the replacement. No change removes a working purchase path before that.
- Payments follow the person's answer to the payment question of the site study (step 4), and the existing checkout or
  payment link stays in place until they confirm its replacement:
  - **Stripe**: a change that wires `@pikku/addon-commerce-stripe` (catalogue, cart, hosted Stripe Checkout, orders,
    fulfilment, refunds and its webhook, for one-off purchases only) instead of the plan's own cart, order and checkout
    tables, citing the capture's Stripe evidence (`behaviour:payments`). The addon ships its tables as SQL per dialect,
    which the published Pikku CLI reads and the next CLI release refuses: the change says it needs a release of the addon
    that declares its tables in `db/tables.ts` before the project moves to that CLI.
  - **Another provider**: a change that uses an addon for it: an existing one first (`pikku addons search <provider>`), else
    one generated from the provider's OpenAPI document (`pikku addons search <provider> --openapi`, then
    `pikku addons add <name|url|path>`); a provider with no published OpenAPI document is an "Open question: ...".
  - **No answer, or they do not know**: keep the existing checkout or payment links, with an "Open question: ..." for the
    replacement.
  - Recurring payments (subscriptions, plans, memberships) are an "Open question: ..." naming better-auth's Stripe
    plugin, never the commerce addon.
- Moving the domain (DNS, registrar, mail records, the old host's shutdown) is the owner's operation, not app code: it is an
  "Open question: ..." in the data change, never a change of its own.
- A clone needs its look first. The capture is already in `artifacts/references/<site>/` (with `behaviour.json`): file no
  capture or "complete the reference" change. A step or page the capture could not reach is an "Open question: ..." in the
  change that needs it. Then a frame change
  (`frontend`: header, footer, theme). Every page change depends on the frame change, so no page is built before the frame exists.
- The frame change carries the shared behaviour of `interactions.md` (the menu that opens, the header on scroll, hover and
  focus states, transitions, the language switch), and a page change the behaviour of its own pages. A change that builds a
  form lists every field with its type, whether required, its options and any control beside it, and the validation and
  receipt the original shows.
- Every `frontend` change lists the pages it builds in `"pages"`, as route paths: `"pages": ["/", "/about"]`. At most 5 pages per
  change. `pikku changes done` compares exactly those pages with the original and refuses until each one matches.
- Pages that share a template are one change, not one change each: every product page of a shop, every collection, every article,
  every event. Write one change for the template, list two or three of its routes as `"pages"` to check it on, and name every
  route that follows it in the body (language versions too): each page of `pages.txt` is named by its path in some change.
  A template the capture sampled (`templates.json`: its pattern, how many pages and the few captured) is named by its
  pattern and count, such as `/event-info/*` (548 pages), with its captured routes; its pages are records, not routes
  written one by one. The catalogue (the products, the articles) belongs in the data change as records, not in pages. A plan of
  dozens of changes with one page each is a plan nobody can build or review.
- A page the original does not have (an owner screen, a sign-in, an admin list, a page that is new in the rebuilt site) cannot be
  compared: list it in `"newPages"`, not in `"pages"`, e.g. `"newPages": ["/app/calendar"]`. A change with only new pages is not
  held to a compare.
- The starter's `/` redirects to the owner login, and its sign-in and shell carry the starter's own wording ("Cloud Starter").
  The frame change makes `/` serve the site's main page and replaces every starter string in `apps/app/messages` with the site's
  own, so a visitor never lands on a login screen and the owner area says whose it is.
