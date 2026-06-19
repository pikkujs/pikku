import { pikku } from '../pikku-nextjs.gen'

export default async function Page() {
  const result = await pikku().staticGet('/hello', {})
  return <div>{result.message}</div>
}
