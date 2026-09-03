---
'@pikku/console': patch
---

Give `UsersTable` an optional ban-state column, so the presentation-only table
can say what `UsersDirectoryPanel` already says.

`UsersTableLabels` gains `columnStatus`, `statusBanned` and `statusActive`, and
`UsersTableUser` gains `banned`. All four are optional and the column appears
only when the host supplies the labels *and* some row carries a value — the same
rule the directory panel uses, and for the same reason: `banned: undefined` means
the app has no `pikkuBan()` plugin and therefore no ban state, so rendering
"active" would be inventing a status the server never reported.

This is what Fabric's stage Users tab needed. It had been passing `banned`,
`roleAdmin` and `roleUser` copy into a component that declared no such labels,
where TypeScript dropped them in silence and the table rendered two columns.
