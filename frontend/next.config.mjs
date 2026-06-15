/** @type {import('next').NextConfig} */
const nextConfig = {
  // The live gate (E3-AUTH) lives in the pure core at ../src/live/gate.ts and is
  // imported by app/api/run. Allow Next to transpile that one TS file from
  // outside the frontend project root.
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,
};

export default nextConfig;
