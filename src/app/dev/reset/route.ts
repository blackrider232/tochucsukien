import { NextResponse, type NextRequest } from 'next/server';
import { devMemoryEnabled } from '@/core/dev/mode';
import { resetDevRuntime } from '@/core/dev/runtime';

// Dev memory runtime only: drops every row and runs the features' devSeed again. A 404 everywhere else.
// GET answers 200 for scripts; the /dev/role form POSTs and lands back on the shell.
export async function GET() {
  if (!devMemoryEnabled()) return new NextResponse(null, { status: 404 });
  await resetDevRuntime();
  return NextResponse.json({ reset: true });
}

export async function POST(request: NextRequest) {
  if (!devMemoryEnabled()) return new NextResponse(null, { status: 404 });
  await resetDevRuntime();
  return NextResponse.redirect(new URL('/', request.url), 303);
}
