import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // No `search` key: the static-tiles URL always carries ?access_token=...,
        // and remotePatterns' search field (when set) requires an exact string
        // match against the request's query string — "" only matches a bare URL.
        protocol: "https",
        hostname: "api.mapbox.com",
        port: "",
        pathname: "/styles/v1/**",
      },
    ],
  },
};

export default nextConfig;
