import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const scriptSrc = isProd
  ? "'self' 'unsafe-inline' https://unpkg.com https://id.vk.com https://id.vk.ru"
  : "'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://id.vk.com https://id.vk.ru";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src https://yoomoney.ru https://yookassa.ru https://oauth.vk.com https://oauth.yandex.ru https://id.vk.ru https://id.vk.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: csp },
    ];
    if (isProd) {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [
      {
        source: "/:path*",
        headers: base,
      },
    ];
  },
};

export default nextConfig;
