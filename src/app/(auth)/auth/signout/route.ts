import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/core/auth/server';

// The shell's sign-out form and the idle guard post here. 303 turns the POST into a GET of the login page.
export async function POST(request: NextRequest) {
  await signOut();
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
