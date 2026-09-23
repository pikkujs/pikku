---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/addon-admin': patch
---

`admin:listUsers` now pages, counts and can carry roles.

`ListUsersInput` gains `offset` and `includeRoles`; `ListUsersOutput` gains `total`, and each `User` gains `roles` and `fields`. `total` is how many users match `search`, which is what a pager counts against — `users.length` never was, because it is capped by `limit`.

```typescript
const { users, total } = await rpc.invoke('admin:listUsers', {
  search: 'example.com',
  limit: 50,
  offset: 50,
  includeRoles: true,
})
```

Paging only means something over a stable order, so the query now sorts newest first rather than however the database felt like returning rows.

Synthetic principals — the platform credential owner, Fabric service users, scenario actors — are excluded by the query instead of dropped from the page afterwards. Filtering after the fact broke both halves of paging: `limit` had already counted the rows it then discarded, so a page came back short, and `offset` skipped synthetic rows as though they were people, so the same person could appear on two pages or on none.

`includeRoles` is refused without `admin:scopes:read`. `admin:users:list` says who may see the directory; it does not say who may see what each of those users can do.

`ScopeService` gains `listRolesForUsers(userIds)`, implemented in `@pikku/kysely`. It answers for every id asked for — an empty array for a user holding no roles, so a caller cannot read a missing key as "holds nothing" — and chunks its `in` list to stay inside the bound-parameter cap. A page of users used to cost one query per row, which on a database reached over the network is a round trip per row.

```typescript
listRolesForUsers(userIds: string[]): Promise<Record<string, string[]>>
```

Anything implementing `ScopeService` outside this repository has to add it.
