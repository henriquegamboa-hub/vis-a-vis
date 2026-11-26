/**
 * After a GitHub Pages build, make the prerendered shell usable on a static host.
 *
 * GitHub Pages serves index.html for the site root and 404.html for every other
 * path. Jekyll, which Pages runs by default, drops directories that start with
 * `_` unless a `.nojekyll` file is present.
 */
import { access, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";

const CANDIDATES = [
  "dist/client/index.html",
  "dist/client/_shell.html",
  ".output/public/index.html",
  ".output/public/_shell.html",
];

export async function publishPagesShell() {
  for (const file of CANDIDATES) {
    try {
      await access(file, constants.F_OK);
    } catch {
      continue;
    }
    const dir = dirname(file);
    const index = join(dir, "index.html");
    if (file !== index) await copyFile(file, index);
    await copyFile(index, join(dir, "404.html"));
    await writeFile(join(dir, ".nojekyll"), "");
    console.log(`[pages] published ${index} and 404.html`);
    return;
  }
  throw new Error("[pages] prerendered HTML was not found");
}
