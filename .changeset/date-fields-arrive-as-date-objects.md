---
'@pikku/skills': patch
---

pikku-react's client reference now says what `transformDate: true` costs you: a fully-zoned ISO instant arrives as a `Date` while a bare or zoneless date stays a string, so one field's runtime type follows the value — a string method on a revived one throws, and a raw one in JSX crashes the route.
