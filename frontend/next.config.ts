import type { NextConfig } from "next";

const privatePaths = ["login", "register", "verify-email", "forgot-password", "reset-password", "onboarding", "invite", "dashboard", "repositories", "reviews", "findings", "analytics", "team", "settings", "secret-scanner", "api"];
const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return privatePaths.map((path) => ({
      source: "/" + path + "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
};
export default nextConfig;
