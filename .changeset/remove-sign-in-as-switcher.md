---
'@pikku/react': patch
'@pikku/cli': patch
---

Removes the dev "Sign in as …" switcher. `@pikku/react` no longer exports `useDevVirtualUsers`, `signInAsVirtualUser` or their option and result types, and `pikku cloud validate` no longer reports `app-missing-virtual-user-quick-login-<app>` for a login screen without one-click virtual user sign-in. A client app that wants one-click sign-in posts a virtual user id to `/auth/sign-in/switch-virtual-user` itself. The starter template drops the `devSwitcher` flag and the field-service example drops its switcher.
