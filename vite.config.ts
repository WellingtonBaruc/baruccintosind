import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

const APP_VERSION = String(Date.now());

function versionJsonPlugin(): Plugin {
  return {
    name: "version-json",
    buildStart() {
      fs.writeFileSync(
        path.resolve(__dirname, "public/version.json"),
        JSON.stringify({ version: APP_VERSION }, null, 2) + "\n"
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), versionJsonPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^react$/, replacement: path.resolve(__dirname, "./node_modules/react") },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, "./node_modules/react-dom") },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, "./node_modules/react/jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js") },
    ],
  },
}));
