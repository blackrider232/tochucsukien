import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KitGallery } from './kit-gallery';

export const metadata: Metadata = { title: 'Thư viện giao diện' };

// Developer-only specimen sheet of every kit primitive in light and dark. Gone in production builds.
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitGallery />;
}
