---
'@pikku/cli': patch
---

feat(deploy): server-target container image uses `FROM node:26` (full)

The generated `SERVER_DOCKERFILE` for `target: 'server'` units now builds on
the full `node:26` image instead of `node:22-slim`. A server container is a
real Node runtime that may pull externalised deps with native addons; the slim
image lacks the build toolchain (python3/make/g++), so any dep that compiles
from source at `npm install` time would fail. The full image carries the
toolchain and bumps the runtime to Node 26.
