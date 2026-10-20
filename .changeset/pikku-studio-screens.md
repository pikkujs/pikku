---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

An addon declares its Pikku Studio screens with `pikkuStudio({ title, screens })` from `@pikku/core/addon`. Each screen has a `path`, a `title` (a message key in the addon's `messages/{locale}.json`, also the nav label), a lazy `component` or an `app`, and a `scope`: `'studio'` (`/<path>`), `'team'` (`/<team>/<path>`) or `'project'` (`/<team>/<project>[/<target>]/<path>`). Optional: `nav: { area: 'rail' | 'team' | 'project' | 'account', icon, order, badge? }` where `badge` names a function of the addon returning a count, `replaces`, `needsApp` (project screens only, default false), `layout: 'bare'` and `scopes` (hide the screen; not access control). Both inspectors emit the screens in the `studio` metadata, and `pikku new addon-ui` scaffolds the new form with a `messages/en.json`.

New codes: PKU357 (two screens of an addon use the same path), PKU358 (a title key missing from the addon's `messages/en.json`), PKU359 (a `nav.badge` naming no function of the addon). A non-literal field is PKU345, and a key missing from another locale is a warning.

Breaking: `defineScreens` and its types (`ScreensManifest`, `AddonScreen`, `AddonComponentScreen`, `AddonAppScreen`) are removed with no alias, the manifest's top-level `icon` is gone, and `nav` is an object instead of a boolean. The serialized inspector state's `screensManifest`/`addonScreens` are now `studio`/`addonStudio`. See docs/MIGRATION.md.
