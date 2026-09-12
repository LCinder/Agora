import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ['@agora/core', '@agora/data', '@agora/i18n'],
  // Next drops its own CLAUDE.md and AGENTS.md into this folder on every dev
  // run. The project already has one at the root, and a second, untracked
  // copy inside the panel is just something waiting to be committed by
  // accident.
  agentRules: false,
};

export default nextConfig;
