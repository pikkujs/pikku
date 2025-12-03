import { pikku } from '../pikku-nextjs.gen.js'

export default async function Page() {
  const result = await pikku().staticGet('/todos', {})
  return <div>{JSON.stringify(result)}</div>
}
