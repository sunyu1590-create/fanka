import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CloudBase SDK 以 ESM 分发并依赖 Node 内置模块，交给运行时加载而不是打进 bundle。
  serverExternalPackages: ["@cloudbase/js-sdk", "@cloudbase/adapter-node"],
};

export default nextConfig;
