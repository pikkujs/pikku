import { pikku } from '@/pikku-nextjs.gen.js';

export default async function Page() {
  const result = await pikku().staticGet('/');
  return <div>{result}</div>;
}
