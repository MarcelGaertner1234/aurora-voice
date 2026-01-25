import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/aurora-voice',
  images: {
    unoptimized: true,
  },
  // Ensure trailing slashes for static export
  trailingSlash: true,
};

export default nextConfig;
