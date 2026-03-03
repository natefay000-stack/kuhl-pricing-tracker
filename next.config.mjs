import { resolve } from 'path';
import { tmpdir } from 'os';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // On Vercel, use default .next dir. Locally, build outside iCloud to prevent
  // sync from evicting files mid-build (iCloud file-provider deletes .next/static/*)
  distDir: process.env.VERCEL ? '.next' : resolve(tmpdir(), 'kuhl-pricing-tracker-next'),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default nextConfig;
