/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default nextConfig;
