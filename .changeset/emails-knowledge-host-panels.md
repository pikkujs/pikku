---
'@pikku/console': patch
---

Let a host mount the emails compose form and the knowledge note rail as their own panels.

Both screens welded a secondary surface into the page as a bordered column: the
emails variables form beside the preview, and the knowledge note list as the
layout's own drawer. A host embedding either got a card inside its own card, and
neither column could collapse or become a sheet on a phone.

`useEmailsCompose()` now owns the selected template and locale, the typed
variables and the preview they render; hand it to `EmailsComposePanel` to put
the form anywhere and to `EmailsPage` via the new `compose` prop so the preview
takes the full width. `useKnowledgeBrowse()` does the same for the note search
and selection, with `KnowledgeBrowseRail` and `KnowledgePage`'s new `browse`
prop — and `KnowledgePage` is now exported, which it was not before.

This is the shape `usePackagesBrowse` and `useScenariosBrowse` already give the
packages and scenarios screens. Standalone, nothing changes: with no state
passed in, each page mounts its own and renders the surface exactly where it was.
