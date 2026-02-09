/** @type {import('next').NextConfig} */
const nextConfig = {
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
