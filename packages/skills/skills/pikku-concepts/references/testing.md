# Testing

Functions are easily testable because they're pure:

```typescript
const mockServices = {
  logger: new MockLogger(),
  todoStore: new MockTodoStore(),
}

// Call function directly — no HTTP, no framework
const result = await listTodos.func(mockServices, { userId: 'test' })
expect(result.todos).toHaveLength(3)
```
