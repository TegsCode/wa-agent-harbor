// Syncs the one-line installers (public/install.sh, public/install.ps1) from the
// single source of truth in src/lib/setup-scripts.ts. Run after editing that file:
//   node scripts/generate-install.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/setup-scripts.ts", import.meta.url), "utf8");

// Pull the template-literal bodies out of `export const NAME = `...`;`
function extract(name) {
  const start = src.indexOf(`export const ${name} = \``);
  if (start === -1) throw new Error(`Cannot find ${name}`);
  const bodyStart = start + `export const ${name} = \``.length;
  const end = src.indexOf("\`;", bodyStart);
  return src.slice(bodyStart, end);
}

const sh = extract("INSTALL_SH").replace(/\$\{COMPOSE_YML\}/g, extract("COMPOSE_YML"));
const ps1 = extract("INSTALL_PS1").replace(/\$\{COMPOSE_YML\}/g, extract("COMPOSE_YML"));
const unescape = (s) => s.replace(/\\\$\{/g, "${").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

writeFileSync(new URL("../public/install.sh", import.meta.url), unescape(sh));
writeFileSync(new URL("../public/install.ps1", import.meta.url), unescape(ps1).replace(/@'/g, "@'").replace(/'@ \\/g, "'@"));
console.log("[install] wrote public/install.sh and public/install.ps1");
