import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [svelte(), tailwindcss()],

  // Opzioni Vite calibrate per Tauri (applicate solo in `tauri dev`/`tauri build`)
  // 1. non oscurare gli errori di Rust
  clearScreen: false,
  // 2. Tauri si aspetta una porta fissa, fallisce se non disponibile
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. ignora src-tauri per non innescare rebuild del frontend
      ignored: ["**/src-tauri/**"],
    },
  },
}));
