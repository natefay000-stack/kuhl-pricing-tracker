/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  // Increase default timeout for API routes
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
