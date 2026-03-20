import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Явний root, щоб Turbopack не підхоплював чужий package-lock вище по дереву
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
