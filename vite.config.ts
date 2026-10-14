import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load environment variables from the project root .env
  const env = loadEnv(mode, process.cwd(), "");
  const targetPort = env.PORT || "4500";

  return {
    root: path.resolve(__dirname, "src/client"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/client/src"),
        "@shared": path.resolve(__dirname, "src/shared"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${targetPort}`,
          changeOrigin: true,
        },
        "/uploads": {
          target: `http://localhost:${targetPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist/client"),
      emptyOutDir: true,
    },
  };
});
