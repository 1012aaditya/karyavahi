/** @type {import('next').NextConfig} */
const nextConfig = {
  // The domain rules live outside app/ in ../src so the seed generator, the validator and
  // the app all run the same code. Next must transpile those .ts files.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  experimental: { externalDir: true },
  serverExternalPackages: ['node:sqlite'],
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
