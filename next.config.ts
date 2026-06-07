import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone mode for Docker deployment
  output: 'standalone',

  // Security headers
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
        },
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
        },
      ],
    },
  ],

  // Redirects
  redirects: async () => [
    {
      source: '/',
      destination: '/portal/setup',
      permanent: false,
    },
  ],
};

export default nextConfig;
