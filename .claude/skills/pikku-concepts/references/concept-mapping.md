# Concept Mapping: Generic Backend → Pikku

Side-by-side code examples showing how common backend patterns translate to Pikku.

## Route Handler / Controller → pikkuFunc

**Traditional (generic):**

```typescript
// A controller method tied to HTTP
class TodoController {
  async create(req: Request, res: Response) {
    const { title, priority } = req.body
    const todo = await this.todoService.create(title, priority)
    res.json({ todo })
  }
}
// Route: router.post('/todos', controller.create)
```

**Pikku:**

```typescript
// Function knows nothing about HTTP
const createTodo = pikkuSessionlessFunc<CreateTodoInput, TodoOutput>(
  async ({ todoStore, logger }, { title, priority }) => {
    const todo = todoStore.createTodo(title, priority)
    logger.info(`Created todo: ${todo.id}`)
    return { todo }
  }
)

// Wiring (separate file) - grouped with defineHTTPRoutes
export const todoRoutes = defineHTTPRoutes({
  basePath: '/todos',
  tags: ['todos'],
  auth: false,
  routes: {
    create: { method: 'post', route: '', func: createTodo },
    list: { method: 'get', route: '', func: listTodos },
  },
})

// Compose into top-level API
wireHTTPRoutes({
  basePath: '/api',
  routes: { todos: todoRoutes },
})
```

**Key difference:** The function receives `{ title, priority }` as typed data - it doesn't know if it came from HTTP body, WebSocket message, or CLI args. Routes are grouped with `defineHTTPRoutes` (like a controller) and composed with `wireHTTPRoutes`.

---

## Route Parameters → Merged into Data

**Traditional:**

```typescript
// Must extract from req.params, req.query, req.body separately
async getUser(req: Request, res: Response) {
  const id = req.params.id           // from URL
  const fields = req.query.fields     // from query string
  const updates = req.body            // from body
}
```

**Pikku:**

```typescript
// All sources merged into a single typed `data` object
const getUser = pikkuSessionlessFunc<
  { id: string; fields?: string },
  UserOutput
>(async (services, { id, fields }) => {
  // id comes from route param, fields from query - function doesn't care
  return { user: await services.db.getUser(id, fields) }
})

wireHTTP({ method: 'get', route: '/users/:id', func: getUser, auth: false })
```

Pikku merges route params + query string + body + headers into a single typed input.

---

## Middleware → pikkuMiddleware

**Traditional:**

```typescript
// Express-style middleware
function logRequest(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.url}`)
  next()
  console.log(`Response: ${res.statusCode}`)
}
app.use(logRequest)
```

**Pikku:**

```typescript
const logRequest = pikkuMiddleware(async ({ logger }, wire, next) => {
  logger.info('Request started')
  await next()
  logger.info('Request completed')
})

// Apply globally
addHTTPMiddleware('*', [logRequest])

// Apply by route pattern
addHTTPMiddleware('/api/*', [logRequest])
```

**Key difference:** Pikku middleware receives services (injected), not raw req/res.

---

## Auth Guard → Built-in Auth Middleware

**Traditional:**

```typescript
// Custom auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
```

**Pikku:**

```typescript
import { authBearer } from '@pikku/core/middleware'

// One line - handles token extraction, JWT verification, session population
addHTTPMiddleware('*', [authBearer({})])
```

Other built-in options: `authCookie({ cookieName })`, `authApiKey({ header })`.

---

## Authorization / Role Checks → pikkuPermission

**Traditional:**

```typescript
// Guard or middleware that checks roles
function requireRole(role: string) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}
router.delete('/users/:id', requireRole('admin'), deleteUser)
```

**Pikku:**

```typescript
const isAdmin = pikkuPermission(async (services, data, wire) => {
  const session = await wire.session.get()
  return session?.role === 'admin'
})

// Apply to route pattern
addHTTPPermission('/admin/*', { admin: [isAdmin] })

// Or inline on specific wiring
wireHTTP({
  route: '/users/:id',
  method: 'delete',
  func: deleteUser,
  permissions: { admin: [isAdmin] },
})
```

**Permission groups:** `{ groupA: [perm1, perm2], groupB: [perm3] }` means `(perm1 AND perm2) OR perm3`.

---

## DTO / Request Validation → Standard Schema

**Traditional (class-validator):**

```typescript
class CreateTodoDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: string
}
```

**Pikku (Zod):**

```typescript
const CreateTodoInputSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.enum(['low', 'medium', 'high']).optional(),
})

// Schema declared on function - auto-validated before function runs
const createTodo = pikkuSessionlessFunc({
  input: CreateTodoInputSchema,
  output: TodoOutputSchema,
  func: async (services, data) => { ... },
})
```

Also supports Valibot, ArkType, or any Standard Schema-compatible library.

---

## Dependency Injection → Service Factories

**Traditional (class-based DI):**

```typescript
@Injectable()
class TodoService {
  constructor(
    @Inject('DATABASE') private db: Database,
    private logger: Logger
  ) {}

  async create(title: string) {
    this.logger.info('Creating todo')
    return this.db.insert('todos', { title })
  }
}
```

**Pikku:**

```typescript
// Define services once at startup
const createSingletonServices = pikkuServices(async (config) => ({
  logger: new ConsoleLogger(),
  db: new KyselyService(config.database),
  todoStore: new TodoStore(),
}))

// Functions destructure what they need
const createTodo = pikkuSessionlessFunc(
  async ({ logger, todoStore }, { title }) => {
    logger.info('Creating todo')
    return { todo: todoStore.createTodo(title) }
  }
)
```

**Key difference:** No container, no decorators, no class hierarchy. Just a factory function returning an object.

Per-request services (like scoped loggers) use `pikkuWireServices`:

```typescript
const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => ({
    scopedLogger: new ScopedLogger(wire.session?.initial?.userId),
  })
)
```

---

## WebSocket Handlers → wireChannel

**Traditional:**

```typescript
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const { type, payload } = JSON.parse(raw)
    switch (type) {
      case 'subscribe':
        handleSubscribe(ws, payload)
        break
      case 'create':
        handleCreate(ws, payload)
        break
    }
  })
  ws.on('close', () => handleDisconnect(ws))
})
```

**Pikku:**

```typescript
wireChannel({
  name: 'todos-live',
  route: '/',
  onConnect, // pikkuVoidFunc
  onDisconnect, // pikkuVoidFunc
  onMessageWiring: {
    action: {
      // First level of message routing
      subscribe: { func: subscribe },
      create: { func: createTodo },
      auth: { func: login, auth: false },
    },
  },
})
```

Functions send data back via `wire.channel.send(data)`. Structured message routing replaces manual switch/case parsing.

---

## Job Queue Workers → wireQueueWorker

**Traditional (Bull/BullMQ):**

```typescript
const queue = new Queue('reminders')

// Producer
await queue.add('send-reminder', { todoId: '123', userId: 'user1' })

// Consumer
const worker = new Worker('reminders', async (job) => {
  const { todoId, userId } = job.data
  await sendReminder(todoId, userId)
})
```

**Pikku:**

```typescript
// Same pikkuFunc shape - knows nothing about queues
const processReminder = pikkuSessionlessFunc(
  async ({ todoStore, logger }, { todoId, userId }) => {
    const todo = todoStore.getTodo(todoId)
    if (todo && !todo.completed) {
      logger.info(`Sending reminder for: ${todo.title}`)
    }
    return { processed: true }
  }
)

// Wire it to a queue
wireQueueWorker({ name: 'todo-reminders', func: processReminder })

// Enqueue from other functions via queue service
await services.queueService.addJob('todo-reminders', {
  todoId: '123',
  userId: 'user1',
})
```

---

## Cron / Scheduled Tasks → wireScheduler

**Traditional:**

```typescript
import cron from 'node-cron'
cron.schedule('0 9 * * *', async () => {
  const stats = await todoService.getStats()
  console.log(`Daily: ${stats.completed}/${stats.total}`)
})
```

**Pikku:**

```typescript
const dailySummary = pikkuVoidFunc(async ({ logger, todoStore }) => {
  const stats = todoStore.getStats('user1')
  logger.info(`Daily: ${stats.completed}/${stats.total}`)
})

wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
})
```

---

## Module / Feature Grouping → Tags + File Organization

**Traditional (NestJS):**

```typescript
@Module({
  imports: [DatabaseModule],
  controllers: [TodoController],
  providers: [TodoService],
  exports: [TodoService],
})
export class TodoModule {}
```

**Pikku:**

```
// No module system. Organize by convention:
src/
├── functions/
│   └── todos.functions.ts     # All todo business logic
├── wirings/
│   └── todos.http.ts          # All todo HTTP routes
└── schemas.ts                 # Shared schemas

// Use tags for cross-cutting concerns:
wireHTTP({ route: '/todos', func: listTodos, tags: ['todos', 'public'] })
addMiddleware('todos', [loggingMiddleware])  // Applies to all 'todos'-tagged functions
```

---

## Error Handling → Typed Errors

**Traditional:**

```typescript
if (!todo) {
  res.status(404).json({ error: 'Todo not found' })
  return
}
if (!canEdit(user, todo)) {
  res.status(403).json({ error: 'Forbidden' })
  return
}
```

**Pikku:**

```typescript
import { NotFoundError, ForbiddenError } from '@pikku/core/errors'

const updateTodo = pikkuFunc(async (services, { id, title }, wire) => {
  const todo = services.todoStore.getTodo(id)
  if (!todo) throw new NotFoundError('Todo not found')

  const session = await wire.session.get()
  if (todo.userId !== session.userId) throw new ForbiddenError()

  return { todo: services.todoStore.update(id, { title }) }
})
```

Pikku catches these errors and maps them to appropriate HTTP status codes automatically.

---

## Session Management

**Traditional:**

```typescript
// Express session
app.use(session({ store: new RedisStore({ client: redis }), secret: 'key' }))

// In handler
req.session.userId = user.id // Set
const userId = req.session.userId // Get
req.session.destroy() // Clear
```

**Pikku:**

```typescript
// Session is on the wire context, managed by auth middleware
const login = pikkuSessionlessFunc(
  async ({ jwt }, { username, password }, wire) => {
    const user = authenticate(username, password)
    const token = await jwt.sign({ userId: user.id })
    await wire.session.set({ userId: user.id, user }) // Set
    return { token, user }
  }
)

const getMe = pikkuFunc(async (services, data, wire) => {
  const session = await wire.session.get() // Get
  return { user: session.user }
})

const logout = pikkuFunc(async (services, data, wire) => {
  await wire.session.clear() // Clear
  return { success: true }
})
```

---

## API Client Generation

**Traditional:**

```typescript
// Manually written or generated via OpenAPI
const response = await fetch('/api/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'New todo' }),
})
const data: unknown = await response.json()
```

**Pikku (auto-generated, fully typed):**

```typescript
import { createPikkuFetchClient } from './.pikku/pikku-fetch.gen.js'

const client = createPikkuFetchClient({ baseUrl: 'http://localhost:4002' })
const result = await client.post('/todos', { title: 'New todo' })
// result is fully typed as TodoOutput - no manual type casting
```

Generated by running `npx pikku prebuild`. Both HTTP and WebSocket clients available.
