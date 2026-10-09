---
'@pikku/better-auth': minor
'@pikku/addon-admin': patch
'@pikku/skills': patch
---

Breaking: `pikkuFabric` and its `FabricPluginOptions` type are removed from `@pikku/better-auth`, along with the deprecated `fabric` registry entry. An app whose `auth.ts` still imports `pikkuFabric` fails to build on this version; remove the plugin, `FABRIC_AUTH_PUBLIC_KEY` and `FABRIC_STAGE_ID` from it, since Fabric now serves the operator sign-in route itself. The default impersonation gate admits only callers holding `admin:impersonate`, and `pikkuDelegatedAuth` refuses only actor rows. Added: `provisionPersonas` and its option, result and services types are exported, and its services need only an auth getter resolving `$context`. `@pikku/addon-admin` treats any truthy `fabric` marker as a non-person. The auth skill drops the `pikkuFabric` documentation.
