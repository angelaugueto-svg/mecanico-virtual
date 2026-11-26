// Copia los estáticos de src/ a dist/ (lo que sirve el backend).
// Sin dependencias: no hay bundler, la app es HTML/CSS/JS plano.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(src, dist, { recursive: true });
console.log("build ok -> dist/ (index.html, styles.css, app.js)");
