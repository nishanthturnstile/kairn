import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    !isSsrBuild && tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  ssr: { noExternal: true },
  preview: {
    proxy: process.env.KAIRN_BROWSER_IDENTITY_UPSTREAM
      ? { "/api": process.env.KAIRN_BROWSER_IDENTITY_UPSTREAM }
      : undefined,
  },
  build: isSsrBuild
    ? { outDir: "dist/server" }
    : {
        outDir: "dist/client",
        manifest: true,
        rolldownOptions: {
          input: { creator: "index.html", reader: "src/reader/client.tsx" },
        },
      },
}));
