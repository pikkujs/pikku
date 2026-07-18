---
'@pikku/console': patch
---

Installing an addon from the console now lets you name the instance and drops
you on its setup. The browse drawer gains an editable "Instance name" field
(defaulting to the derived slug) that becomes the `wireAddon` name, so the same
package can be wired under a distinct name. On a successful install the console
routes straight to the addon's detail page, whose Setup tab surfaces the OAuth
integrations and secrets the addon needs.
