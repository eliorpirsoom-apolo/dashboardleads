/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep server-only packages out of the bundle (Next 14 syntax).
    serverComponentsExternalPackages: ["@prisma/client", "nodemailer"],
  },
};

module.exports = nextConfig;
