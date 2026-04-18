import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

const projectRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: [
      { find: /^lucide-react$/, replacement: path.resolve(projectRoot, "client", "src", "lib", "lucide-react.ts") },
      { find: "@shared", replacement: path.resolve(projectRoot, "shared") },
      { find: "@assets", replacement: path.resolve(projectRoot, "attached_assets") },
      { find: "@", replacement: path.resolve(projectRoot, "client", "src") },
    ],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(projectRoot, "client"),
  build: {
    outDir: path.resolve(projectRoot, "dist/public"),
    emptyOutDir: true,
  },
  optimizeDeps: {
    entries: ["client/src/**/*.{ts,tsx}"],
    esbuildOptions: {
      absWorkingDir: projectRoot,
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
      allow: [projectRoot],
    },
  },
});
