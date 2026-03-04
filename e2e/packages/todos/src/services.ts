import { TodoStore } from './todo-store.service.js'
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async () => {
  const todoStore = new TodoStore()
  return { todoStore }
})
