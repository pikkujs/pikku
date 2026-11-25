---
'@pikku/cli': patch
'@pikku/skills': patch
---

The site capture never opens a link that would change a shop on the live site: cart and checkout paths and queries that add to or remove from a cart or wishlist (WooCommerce `?add-to-cart=`, `?remove_item=` and their kind) are recorded under `actions` as not opened, and are never captured as pages or opened as a sibling app.
