---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

Native apps hang off `frontends`: `pikku app native init|add|upgrade|check <name>` writes and maintains a committed Tauri project per frontend (desktop and Android; bundled dist, a deployed URL, or a bundled server sidecar). App commands move under `pikku app` (`pikku app new`, `pikku app list`). The top-level `frontend` key is replaced by `frontends` in `pikku.config.json`, where the one entry with `serve` is what `pikku serve`/`dev`/standalone deploys mount. `deploy apply --desktop` is gone — a frontend's `native.bundleServer` asks for the sidecar instead.
