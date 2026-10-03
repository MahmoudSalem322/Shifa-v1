import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/* Next.js infers the workspace root by walking up for the nearest
   lockfile. On some machines that walk lands outside this project (e.g.
   a lockfile or package.json sitting in the user's home directory), which
   triggers: "Next.js ignored package-lock.json in ... because it would
   include your home directory". Pinning outputFileTracingRoot to this
   project's own folder makes the root explicit regardless of what else
   exists on the machine, and is a no-op when the inferred root was
   already correct. */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
