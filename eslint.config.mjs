import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // 项目全局 images.unoptimized: true，且 ProgressiveImage 等组件有自定义
      // 渐进式加载与错误处理逻辑，不适合替换为 next/image 包装器。
      "@next/next/no-img-element": "off",
      // _ 前缀变量表示有意保留但当前未引用（预留扩展、API 参数占位等）
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**"],
  },
];
