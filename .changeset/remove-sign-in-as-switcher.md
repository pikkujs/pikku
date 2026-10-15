---
'@pikku/react': patch
'@pikku/cli': patch
---

Removes the dev "Sign in as …" switcher. `@pikku/react` no longer exports `useDevVirtualUsers` or its option and result types; `signInAsVirtualUser` and `listDevVirtualUsers` stay. `pikku cloud validate` still requires a login screen to offer one-click virtual user sign-in, but it now accepts only a `signInAsVirtualUser()` call or the `/auth/sign-in/virtual-user` endpoint, no longer `<DevVirtualUserSwitcher />` or `useDevVirtualUsers()`. The starter template drops the `devSwitcher` flag and the field-service example drops its switcher.
