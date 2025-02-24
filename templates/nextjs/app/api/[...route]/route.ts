// import { pikku } from '@/vramework-nextjs.js'
import { NextRequest, NextResponse } from 'next/server.js'

export async function GET(_req: NextRequest) {
  // return pikku().apiRequest(req, res);
  return NextResponse.next()
}
