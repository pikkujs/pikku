# The image every E2E job runs in.
#
# The Playwright base ships the browsers and their runtime deps but no toolchain,
# so each E2E job used to open with `apt-get install build-essential python3
# unzip` against archive.ubuntu.com. That put a third-party mirror on the
# critical path of a 10-minute job: on a slow day it delivered ~150 KB/s, ate the
# entire budget downloading gcc, and GitHub reported the timeout as `cancelled` —
# a red pipeline in which not one test had run. Baking the toolchain in removes
# the network from the job entirely.
#
# The tag tracks PLAYWRIGHT_VERSION, so bumping the base publishes a new tag
# rather than mutating one the workflows already pin.
ARG PLAYWRIGHT_VERSION=v1.58.2-noble
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}

# node-gyp needs a C/C++ toolchain and python3 to build native modules; unzip is
# used by the setup action. --no-install-recommends and dropping the apt lists
# keep the layer to what is actually needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    unzip \
  && rm -rf /var/lib/apt/lists/*
