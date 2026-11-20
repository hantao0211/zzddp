import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  output: process.env.ZZDDP_STATIC_EXPORT === "1" ? "export" : "standalone",
  trailingSlash: true,
};

export default config;
