import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trust Cloudflare Quick Tunnel hostnames during development.
  // This allows the HMR WebSocket connection to succeed.
  allowedDevOrigins: [
    "*.trycloudflare.com",
  ],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevents the app from being embedded in an <iframe> on another site (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops the browser from guessing content types away from what's declared.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Doesn't leak the full URL (which can contain tokens) to third-party link targets.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
