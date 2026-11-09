// Post-processes the SPA build in dist/client into a GitHub Pages-ready folder.
// - index.html + 404.html (Pages serves 404.html for client-side routes)
// - .nojekyll so folders starting with "_" (like _shell) are published
// - favicon link gets the project-site base path
import { copyFile, readFile, writeFile } from "node:fs/promises";

const dir = new URL("../dist/client/", import.meta.url);
const base = "/wa-agent-harbor/";

const shell = await readFile(new URL("_shell.html", dir), "utf8");
const html = shell
  .replaceAll('href="/favicon.ico"', `href="${base}favicon.ico"`)
  .replaceAll('href="/robots.txt"', `href="${base}robots.txt"`);

await copyFile(new URL("_shell.html", dir), new URL("_shell.orig.html", dir));
await writeFile(new URL("index.html", dir), html);
await writeFile(new URL("404.html", dir), html);
await writeFile(new URL(".nojekyll", dir), "");
await copyFile(new URL("index.html", dir), new URL("_shell.html", dir));

console.log("[pages] wrote dist/client/index.html, dist/client/404.html and .nojekyll");
