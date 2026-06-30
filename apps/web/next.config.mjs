/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile shared workspace packages (they ship raw TS/TSX).
  transpilePackages: ['@xenia/ui', '@xenia/sdk', '@xenia/shared'],
};

export default nextConfig;
