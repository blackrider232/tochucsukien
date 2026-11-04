import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/code/index.html', destination: '/', permanent: true }];
  },
  // Foundation worker: wire Serwist (service worker) and the Content-Security-Policy headers here.
};

export default nextConfig;
