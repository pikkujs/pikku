# Complete CLI Example

End-to-end: functions + renderers + nested-subcommand wiring. Note how each func's input is the positional `parameters` plus `options`, merged (e.g. `parameters: '<username> <email>'` + option `admin` → func input `{ username, email, admin }`).

```typescript
// functions/admin.functions.ts
export const createUser = pikkuFunc({
  title: 'Create User',
  func: async ({ db }, { username, email, admin }) => {
    const user = await db.createUser({
      username,
      email,
      role: admin ? 'admin' : 'user',
    })
    return { user }
  },
})

export const listUsers = pikkuSessionlessFunc({
  title: 'List Users',
  func: async ({ db }, { limit }) => {
    return { users: await db.listUsers(limit || 50) }
  },
})

export const deleteUser = pikkuFunc({
  title: 'Delete User',
  func: async ({ db }, { username }) => {
    await db.deleteUser(username)
    return { deleted: username }
  },
})

// wirings/cli.wiring.ts
const userRenderer = pikkuCLIRender<{ user: User }>((_services, { user }) => {
  console.log(`Created user: ${user.username} (${user.email}) [${user.role}]`)
})

const usersRenderer = pikkuCLIRender<{ users: User[] }>(
  (_services, { users }) => {
    console.log(`Users (${users.length}):`)
    users.forEach((u) =>
      console.log(`  ${u.username} <${u.email}> [${u.role}]`)
    )
  }
)

wireCLI({
  program: 'admin',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: createUser,
          render: userRenderer,
          options: {
            admin: {
              description: 'Create as admin',
              short: 'a',
              default: false,
            },
          },
        }),
        list: pikkuCLICommand({
          func: listUsers,
          render: usersRenderer,
          options: {
            limit: { description: 'Max results', short: 'l' },
          },
        }),
        delete: pikkuCLICommand({
          parameters: '<username>',
          func: deleteUser,
          description: 'Delete a user',
        }),
      },
    },
  },
})
```
