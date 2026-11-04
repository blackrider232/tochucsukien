import { NextResponse, type NextRequest } from 'next/server';
import { DEV_ROLE_COOKIE, devMemoryEnabled, formatDevRole, parseDevRole } from '@/core/dev/mode';

// The /dev/role form posts here. Sets the sce_dev_role cookie and opens the shell as that actor.
export async function POST(request: NextRequest) {
  if (!devMemoryEnabled()) return new NextResponse(null, { status: 404 });
  const form = await request.formData();
  const identity = parseDevRole(`${String(form.get('role') ?? '')}:${String(form.get('department') ?? '')}`);
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(DEV_ROLE_COOKIE, formatDevRole(identity), { path: '/', sameSite: 'lax' });
  return response;
}
