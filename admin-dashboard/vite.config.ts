import { defineConfig } from "vite";

// base "./" => assets relatifs : servable depuis n'importe quel chemin.
export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
