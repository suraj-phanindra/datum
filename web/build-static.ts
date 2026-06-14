// web/build-static.ts — assemble a fully self-contained static bundle in
// web/dist/ for a pure static host (Cloudflare Pages). On Pages there is no
// node serve.ts, so everything index.html/tower.js reference must be a real file:
//   - /tokens.css       : the design-system tokens (colors+typography+spacing+
//                         base) PLUS @font-face (fonts.css) with URLs rewritten
//                         to ./assets/fonts/, matching what serve.ts synthesizes.
//   - /tokens-shim.css, /tower.js, /drift-card.js, /anim.css, /snapshot.json
//   - /assets/fonts/*.woff2 : the self-hosted Geist / Geist Mono webfonts.
//
// Run: node web/build-static.ts   (zero install; Node built-ins only)
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, readdirSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = dirname(fileURLToPath(import.meta.url));
const REPO = join(WEB, "..");
const DS = join(REPO, "datum Design System");
const DS_TOKENS = join(DS, "tokens");
const DS_FONTS = join(DS, "assets", "fonts");
const DIST = join(WEB, "dist");

// 1) clean dist + fonts dir
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "assets", "fonts"), { recursive: true });

// 2) copy the shipped static assets (must exist in web/)
const STATIC = ["index.html", "tokens-shim.css", "tower.js", "drift-card.js", "anim.css", "snapshot.json"];
for (const f of STATIC) copyFileSync(join(WEB, f), join(DIST, f));

// 3) bake /tokens.css = colors+typography+spacing+base (serve.ts order) + fonts
//    with url("../assets/fonts/..") rewritten to "./assets/fonts/..".
const tokenParts = ["/* datum tokens — bundled for static deploy */"];
for (const f of ["colors.css", "typography.css", "spacing.css", "base.css"]) {
  tokenParts.push(readFileSync(join(DS_TOKENS, f), "utf8"));
}
const fontsCss = readFileSync(join(DS_TOKENS, "fonts.css"), "utf8").replaceAll("../assets/fonts/", "./assets/fonts/");
tokenParts.push(fontsCss);
writeFileSync(join(DIST, "tokens.css"), tokenParts.join("\n\n"), "utf8");

// 4) copy the self-hosted webfonts
for (const f of readdirSync(DS_FONTS)) {
  if (f.endsWith(".woff2")) copyFileSync(join(DS_FONTS, f), join(DIST, "assets", "fonts", f));
}

// 5) bundle the self-playing demo reel under /reel (self-contained: index.html
//    + its relative fonts). Served at <host>/reel/.
const REEL = join(WEB, "reel");
if (existsSync(REEL)) cpSync(REEL, join(DIST, "reel"), { recursive: true });

const files = readdirSync(DIST);
console.log(`built web/dist/ (${files.length} entries): ${files.join(", ")}`);
console.log(`fonts: ${readdirSync(join(DIST, "assets", "fonts")).length} woff2`);
