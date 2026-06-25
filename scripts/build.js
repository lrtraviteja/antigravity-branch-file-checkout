"use strict";

const { execFileSync } = require("node:child_process");
const { mkdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "esbuild",
    "extension.js",
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=cjs",
    "--external:vscode",
    "--minify",
    "--outfile=dist/extension.js"
  ],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true
  }
);
