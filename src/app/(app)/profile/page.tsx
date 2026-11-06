import type { Metadata } from 'next';
import { mfaEnforced } from '@/core/auth/mfa-policy';
import { requestContext } from '@/core/auth/server';
import { ROLES } from '@/core/vocab';
import { ProfileScreen } from '@/features/core';

export const metadata: Metadata = { title: 'Hồ sơ của tôi' };

export default async function ProfilePage() {
  const { actor } = await requestContext();
  return <ProfileScreen profile={actor.profile} requiresMfa={mfaEnforced() && ROLES[actor.profile.role].requiresMfa} />;
}
