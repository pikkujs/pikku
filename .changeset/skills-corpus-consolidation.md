---
'@pikku/skills': patch
'@pikku/cli': patch
---

Consolidate the skills corpus from 63 skills to 21.

The corpus had grown one skill per package and one per transport, so an agent's
first decision was a routing problem — which of ten wiring skills, which of five
auth skills — before it could reach anything that helped. Most of what those
skills carried was signatures and option keys, which `pikku doc` computes from
the compiler and cannot go stale.

Each family collapses to one chooser skill plus per-topic `references/*.md`. The
chooser answers the question the compiler cannot: which thing to pick, what
differs between the options, and what goes wrong silently. The families:

- `pikku-deploy` — eight runtime skills
- `pikku-service-backends` — six adapter skills, organised by the core interface
  they implement rather than by vendor
- `pikku-wiring` — ten transport skills
- `pikku-auth` — five skills that all answered "who is this and may they",
  fronted by the authentication-versus-authorization distinction
- `pikku-services` — services, config, audit and logging
- `pikku-agent` — the agent, its runner and the voice middlewares
- `pikku-react` and `pikku-i18n` — the client and localisation families
- `pikku-meta` — project metadata, contract versioning and the dependency audit
- `pikku-build` — the three build modes, feature work and post-clone cleanup
- `pikku-software-archaeology` and `pikku-fabric` — each gains its second phase

The doc-surface routing table (`LEAF_EDITORIAL`) points at the merged skills, and
the fabric install group is back to what it names: skills about Fabric.
