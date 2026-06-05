import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname)]
    }
  },
  cacheDir: path.resolve(__dirname, "node_modules/.vite")
});
