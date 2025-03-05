// import { pikku } from '@/pikku-nextjs.js'
import { NextRequest } from 'next/server.js'

export async function GET(_req: NextRequest) {
  // return pikku().apiRequest(req, res);
  return Response.json({})
}
