/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep Playwright / Prisma out of the server bundle (Next 14 syntax).
    serverComponentsExternalPackages: [
      "playwright",
      "playwright-core",
      "@prisma/client",
      "@prisma/adapter-libsql",
      "@libsql/client",
      "libsql",
      "nodemailer",
    ],
  },
};

module.exports = nextConfig;
