---
'@pikku/skills': patch
---

pikku-react's client reference now says what `transformDate: true` costs you: a date field arrives as a `Date`, so a string method on it throws and a raw one in JSX crashes the route.
