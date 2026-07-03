import { defineConfig } from "vite";

// base "./" => les chemins d'assets sont relatifs : l'app fonctionne aussi bien
// servie depuis "/" en dev que depuis un dossier statique arbitraire en kiosque.
export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
