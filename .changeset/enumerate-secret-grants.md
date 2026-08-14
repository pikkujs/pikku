---
'@pikku/cli': patch
'@pikku/skills': patch
---

Enumerate addon secret and credential grants in the deployment manifest.

`wireAddon`'s `secretGrants` / `credentialGrants` widen an addon's scope the same
way `globalSecrets` does, only narrower — but the manifest reported the exemption
and not the grant, so a deployment could not see the secrets an app had lent an
addon. `grantedSecretAddons` and `grantedCredentialAddons` now list them by name,
including override keys, since scoping is checked before an override renames.

The `pikku-addon` skill documents the whole grant family and the scoping rule
behind it, rather than the override fields alone.
