import type { NextConfig } from "next";

// Mounted at vishalsingh.org/llm-arena by a beforeFiles rewrite in d3m-book
// (BOOK_ZONES in its next.config.ts). Pages, API routes and /_next assets carry
// this prefix so they resolve through that rewrite; literal fetch() URLs and
// plain <a href> go through withBase() in src/lib/base-path.ts. The cron paths
// in vercel.json carry it too.
const BASE_PATH = "/llm-arena";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  async redirects() {
    // The bare deployment root, the pre-basePath page URLs and the documented
    // API paths have no handler of their own any more; keep old links working.
    // 307 keeps the method, so `POST /api/rounds` still reaches its route.
    return [
      "", "/about", "/analysis", "/arena", "/cohorts", "/cohorts/:id", "/data", "/game", "/insights",
      "/learn", "/markets", "/methodology", "/models", "/models/:id", "/rounds", "/rounds/:id", "/api/:path*",
    ].map((p) => ({
      source: p || "/",
      destination: `${BASE_PATH}${p}`,
      basePath: false as const,
      permanent: false,
    }));
  },
};

export default nextConfig;
