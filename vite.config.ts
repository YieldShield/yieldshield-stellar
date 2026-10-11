import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.secrets/**", "**/.stellar/**", "**/.vercel/**", "**/docs/grants/**"] },
  },
});
