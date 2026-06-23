import { defineConfig } from "vitest/config";

// Test della logica PURA (TypeScript, niente runes/DOM) → basta l'ambiente node di default e nessun
// plugin Svelte: i file .test.ts importano solo moduli .ts semplici (es. shelfRules.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
