import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/vite-plugin-svelte').Config} */
export default {
  // vitePreprocess abilita TypeScript dentro i blocchi <script lang="ts">
  preprocess: vitePreprocess(),
};
