import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ['@agora/core', '@agora/data', '@agora/i18n'],
};

export default nextConfig;
