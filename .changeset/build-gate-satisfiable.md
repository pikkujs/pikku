---
'@pikku/skills': patch
---

Drop `pikku knowledge next --require idle` from the build agent's acceptance. After a milestone is built, `next` moves on to the next unbuilt one, so the gate could only pass on a project with exactly one milestone — on any other it failed a build that had succeeded. Nothing `next` returns can assert that a particular build worked, because every kind it can return afterwards is legitimate.
