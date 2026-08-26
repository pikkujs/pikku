---
'@pikku/skills': patch
---

pikku-react now covers linking from a Mantine element: `component={Link}` widens the router generic to `AnyRouter` and stops checking `to` and `params`, so the skill teaches a wrapped typed `Link` reached through `renderRoot` instead.
