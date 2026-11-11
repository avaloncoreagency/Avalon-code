import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: fileURLToPath(new URL(".", import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".dev-bridge/**", ".avalon-deliveries/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { files: ["tests/**/*.cjs", "scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];

export default config;
