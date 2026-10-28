import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = process.argv[2] === "firefox" ? "firefox" : "chrome";
const isWatch = process.argv.includes("--watch");
const distDir = path.join(__dirname, "dist");

console.log(`[session-swap] Building for target: ${target.toUpperCase()}...`);

// Ensure clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(path.join(distDir, "background"), { recursive: true });
fs.mkdirSync(path.join(distDir, "popup"), { recursive: true });
fs.mkdirSync(path.join(distDir, "assets", "icons"), { recursive: true });

// Copy Manifest
const manifestSrc = target === "firefox" 
  ? path.join(__dirname, "src", "manifest.firefox.json")
  : path.join(__dirname, "src", "manifest.chrome.json");

if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, path.join(distDir, "manifest.json"));
  console.log(`  -> Copied manifest (${target})`);
}

// Copy HTML & CSS
const popupSrc = path.join(__dirname, "src", "popup");
if (fs.existsSync(popupSrc)) {
  const files = fs.readdirSync(popupSrc);
  for (const file of files) {
    if (file.endsWith(".html") || file.endsWith(".css")) {
      fs.copyFileSync(path.join(popupSrc, file), path.join(distDir, "popup", file));
    }
  }
  console.log("  -> Copied popup HTML & CSS");
}

// Copy Icons
const iconsSrc = path.join(__dirname, "src", "assets", "icons");
if (fs.existsSync(iconsSrc)) {
  const icons = fs.readdirSync(iconsSrc);
  for (const icon of icons) {
    fs.copyFileSync(path.join(iconsSrc, icon), path.join(distDir, "assets", "icons", icon));
  }
  console.log("  -> Copied icons");
}

// esbuild config
const commonConfig = {
  bundle: true,
  minify: false,
  sourcemap: false,
  target: target === "firefox" ? ["firefox109"] : ["chrome110"],
  format: "iife",
  platform: "browser",
  logLevel: "info",
};

async function buildAll() {
  try {
    // Build Background
    await esbuild.build({
      ...commonConfig,
      entryPoints: [path.join(__dirname, "src", "background", "index.ts")],
      outfile: path.join(distDir, "background", "index.js"),
    });

    // Build Popup
    await esbuild.build({
      ...commonConfig,
      entryPoints: [path.join(__dirname, "src", "popup", "index.ts")],
      outfile: path.join(distDir, "popup", "index.js"),
    });

    console.log(`[session-swap] Build completed successfully into ./dist`);
  } catch (err) {
    console.error("[session-swap] Build failed:", err);
    process.exit(1);
  }
}

buildAll();
