import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@noah/ui', '@noah/domain'],
};

export default nextConfig;
