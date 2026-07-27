---
'@pikku/console': patch
---

Make the scopes page addressable from a test without selecting on translated copy: the roles table, the scopes vocabulary table, the role editor drawer, the scope checkboxes, the create-role action, the forbidden and load-error states, the user roles drawer and the header search all carry test ids, with `data-role-name` / `data-scope-id` identifying a row. The role editor and user roles drawers carry their test id on the drawer body rather than the drawer root, so it is present only while the drawer is open.
