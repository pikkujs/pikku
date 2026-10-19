---
'@pikku/cli': patch
---

`pikku dev`, `pikku serve` and the generated local services now sync the same scopes a deploy does, including the `app` tree derived from your virtual users. Before, the local scope store lacked it, so a virtual user's `app:` grant had no scope to point at and virtual-user sign-in returned a 500 under `pikku dev` while deployed stages worked.
