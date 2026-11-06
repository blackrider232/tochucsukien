import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quản trị Tổ chức Sự kiện SCE',
    short_name: 'Sự kiện SCE',
    description: 'Quản trị tổ chức sự kiện, Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội.',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f1f5f9',
    theme_color: '#1a2b4c',
    icons: [
      { src: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
