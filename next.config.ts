import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Development-only: Next.js otherwise prints each Server Function call
    // with its arguments, which include applicant contact and medical data.
    serverFunctions: false,
  },
};

export default nextConfig;
