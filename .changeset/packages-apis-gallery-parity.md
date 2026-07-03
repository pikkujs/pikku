---
'@pikku/console': patch
---

The APIs tab now renders through the same gallery/card/drawer as Addons (kind="api" on CommunityGallery/AddonCard/AddonDetailDrawer) instead of a separate table page. The only functional difference is the action: an API is Imported (via installOpenapiAddon, generating a local addon from its OpenAPI spec) rather than Added from an npm package. The drawer shows an operation count instead of the functions/http/channels/secrets/variables tabs, since that data isn't available for an API entry today.
