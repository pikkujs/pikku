import { useMutation, useQuery } from '@tanstack/react-query'

type Mock = (input: any) => unknown

const files = import.meta.glob<{ default: Mock }>('../mocks/*.ts', { eager: true })

const mocks: Record<string, Mock> = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/(.+)\.ts$/, '$1'), mod.default]),
)

const answer = async (name: string, input: unknown) => {
  const mock = mocks[name]
  if (!mock) throw new Error(`No mock for ${name}. Add src/mocks/${name}.ts`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  return mock(input)
}

export const usePikkuQuery = <T = unknown>(name: string, input?: unknown) =>
  useQuery<T>({ queryKey: [name, input ?? null], queryFn: () => answer(name, input) as Promise<T> })

export const usePikkuMutation = <T = unknown, I = unknown>(name: string) =>
  useMutation<T, Error, I>({ mutationFn: (input) => answer(name, input) as Promise<T> })
