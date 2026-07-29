---
'@pikku/console': patch
---

Let a host mount the packages browse rail as its own surface

The addon/API gallery's category rail was welded into `CommunityGallery`, so a
host embedding `PackagesPage` had no way to give it the side-panel treatment its
other screens use. `usePackagesBrowse()` now holds the tab, the picked category
and the active catalogue's buckets; hand that state to `PackagesBrowseRail` to
render the rail wherever the host wants it, and to `PackagesPage` /
`PackagesListPanel` (new `browse` prop) so the gallery drops its inline copy and
takes the full width. Omit it and every page renders exactly as before.
