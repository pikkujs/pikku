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
- Every service in `outside-services.md` is handled by a change: one that replaces it names it (a hosted form becomes the
  app's own form and table, a tracker is removed, fonts and pictures are served by the app, the page builder's hosting is
  the rebuilt app), and one kept says so in the body of the change that links to it: "Decision: keep <service>: <why>".
- A clone needs its look first: after the data change, a capture change (`artifacts`: run
  `pikku ui pages capture <url> --out artifacts/references/<site>`, done when every page on the list has its screenshots and
  style.json there and the pictures are in its `pictures/` folder), then a frame change (`frontend`: header, footer, theme;
  depends on the capture). Every page change depends on the frame change, so no page is built before the capture and the frame exist.
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
