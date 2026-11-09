import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    nitro({ noExternals: true }),
    tailwindcss(),
    react(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
});
