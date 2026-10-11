---
'@pikku/playwright': patch
---

The element drivers resolve shadcn and Radix components (Select, Checkbox, Switch, Tabs, Dialog, sonner toasts, Calendar) instead of Mantine ones. The locator namespace is exported as `ui` rather than `mantine`.
