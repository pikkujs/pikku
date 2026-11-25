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
- The rebuilt site does what the original does, no more. A route, form, table or email comes from the capture: an original
  page, form or redirect, an email the original visibly sends or promises, the owner area, or the data of a service being
  replaced. Anything seen only in policy or legal text, or implied by a service's name (a newsletter the privacy policy
  mentions, an email a booking tool may send), is an "Open question: ..." in the nearest change, never a change, route,
  table or email of its own.
- Every service in `outside-services.md` and every host in `behaviour.json` `outsideHosts` is named by a change: one that
  replaces it (a hosted form becomes the app's own form and table, a tracker or error reporter is removed, fonts and pictures
  are served by the app, the page builder's hosting is the rebuilt app), or one that keeps it, in the body of the change that
  links to it: "Decision: keep <service>: <why>". Before filing, check each one against the plan's bodies.
- Moving the domain (DNS, registrar, mail records, the old host's shutdown) is the owner's operation, not app code: it is an
  "Open question: ..." in the data change, never a change of its own.
- A clone needs its look first. The capture is already in `artifacts/references/<site>/` (with `behaviour.json`): file no
  capture change, only an `artifacts` change for pages the capture missed or that failed, by name. Then a frame change
  (`frontend`: header, footer, theme). Every page change depends on the frame change, so no page is built before the frame exists.
- The frame change carries the shared behaviour of `interactions.md` (the menu that opens, the header on scroll, hover and
  focus states, transitions, the language switch), and a page change the behaviour of its own pages. A change that builds a
  form lists every field with its type, whether required, its options and any control beside it, and the validation and
  receipt the original shows.
- Every `frontend` change lists the pages it builds in `"pages"`, as route paths: `"pages": ["/", "/about"]`. At most 5 pages per
  change. `pikku changes done` compares exactly those pages with the original and refuses until each one matches.
- Pages that share a template are one change, not one change each: every product page of a shop, every collection, every article,
  every event. Write one change for the template, list two or three of its routes as `"pages"` to check it on, and say in the body how
  many pages follow it. The catalogue (the products, the articles) belongs in the data change as records, not in pages. A plan of
  dozens of changes with one page each is a plan nobody can build or review.
- A page the original does not have (an owner screen, a sign-in, an admin list, a page that is new in the rebuilt site) cannot be
  compared: list it in `"newPages"`, not in `"pages"`, e.g. `"newPages": ["/app/calendar"]`. A change with only new pages is not
  held to a compare.
- The starter's `/` redirects to the owner login, and its sign-in and shell carry the starter's own wording ("Cloud Starter").
  The frame change makes `/` serve the site's main page and replaces every starter string in `apps/app/messages` with the site's
  own, so a visitor never lands on a login screen and the owner area says whose it is.
