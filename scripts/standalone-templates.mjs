// Templates that are whole standalone projects rather than workspace members.
// Each pins exact published @pikku/* versions (not the versions in this repo),
// has its own lockfile, and is fetched whole by `create-pikku`. They are
// snapshots of a released API, so repo-wide checks that compare against the
// current workspace (peer-range consistency, renamed vocabulary) do not apply
// to them; they are validated by scaffolding and building them instead.
export const STANDALONE_TEMPLATES = [
  'online-shop',
  'field-service',
  'hotel-management',
  'public-content',
  'team-saas',
  'workflow-automation',
]
