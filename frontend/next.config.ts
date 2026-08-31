import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // "standalone" emits .next/standalone/server.js together with a minimal node_modules
  // tree. The Docker runner stage copies only that output, so the shipped image contains
  // neither the build toolchain nor devDependencies.
  output: 'standalone',

  // Pin the file-tracing root to this project. Without it Next walks up looking for a
  // lockfile, and any stray package-lock.json in a parent directory makes it nest the
  // standalone output under the discovered path - which silently breaks the Dockerfile's
  // `COPY .next/standalone ./`.
  outputFileTracingRoot: path.join(__dirname),

  reactStrictMode: true,
  poweredByHeader: false,

  // The storefront is rendered on the server and the browser never talks to the APIs
  // directly, so no remote image hosts are configured here on purpose.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
