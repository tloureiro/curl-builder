import { randomBytes } from "node:crypto";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rendererRoot = path.resolve(__dirname, "src/renderer");

export default defineConfig(({ command }) => {
  const nonce = randomBytes(16).toString("base64");
  return {
    root: rendererRoot,
    base: "./",
    html: { cspNonce: command === "serve" ? nonce : undefined },
    plugins: [react(), {
      name: "local-development-csp", apply: "serve",
      transformIndexHtml: { order: "pre", handler: (html) => html
        .replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
        .replace("connect-src 'none'", "connect-src http://127.0.0.1:5173 ws://127.0.0.1:5173") },
    }],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "src/shared"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: path.resolve(__dirname, "dist/renderer"),
      emptyOutDir: true,
    },
  };
});
