import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import {
  colors,
  motion,
  spacing,
  typeScale,
} from "../../packages/design-tokens/src/index.js";

const theme = `:root {
  --kairn-canvas: ${colors.canvas};
  --kairn-paper: ${colors.paper};
  --kairn-ink: ${colors.ink};
  --kairn-subdued: ${colors.subdued};
  --kairn-line: ${colors.line};
  --kairn-accent: ${colors.accent};
  --kairn-accent-wash: ${colors.accentWash};
  --kairn-danger: ${colors.danger};
  --kairn-title: ${typeScale.title / 16}rem;
  --kairn-section: ${spacing.section / 16}rem;
  --kairn-motion: ${motion.state}ms;
}`;

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    !isSsrBuild && tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: "kairn-theme",
      resolveId: (id) =>
        id === "virtual:kairn-theme.css" ? "\0kairn-theme.css" : null,
      load: (id) => (id === "\0kairn-theme.css" ? theme : null),
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  ssr: { noExternal: true },
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
