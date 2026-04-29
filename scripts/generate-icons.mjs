import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import toIco from "to-ico";

const rootDir = process.cwd();
const sourceSvgPath = resolve(rootDir, "public/hfsm-logo.svg");
const trayTemplateSvgPath = resolve(rootDir, "public/hfsm-tray-template.svg");
const faviconPath = resolve(rootDir, "app/favicon.ico");
const buildIconsDir = resolve(rootDir, "build/icons");
const iconPngPath = resolve(buildIconsDir, "icon.png");
const iconIcoPath = resolve(buildIconsDir, "icon.ico");
const iconIcnsPath = resolve(buildIconsDir, "icon.icns");
const trayTemplatePngPath = resolve(buildIconsDir, "trayTemplate.png");
const trayTemplate2xPngPath = resolve(buildIconsDir, "trayTemplate@2x.png");
const iconsetDir = resolve(buildIconsDir, "mac.iconset");
const tempDir = resolve(buildIconsDir, ".tmp-generate-icons");

const iconsetEntries = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

const icoSizes = [16, 32, 48, 64, 128, 256];
const faviconSizes = [16, 32, 48];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function ensureReadable(path) {
  await access(path, constants.R_OK);
}

async function renderPng(size, outputPath, inputPath = sourceSvgPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  run("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", outputPath, inputPath]);
}

async function createIco(outputPath, sizes) {
  const pngPaths = [];

  for (const size of sizes) {
    const pngPath = join(tempDir, `${size}.png`);
    await renderPng(size, pngPath);
    pngPaths.push(pngPath);
  }

  const pngBuffers = await Promise.all(pngPaths.map((pngPath) => readFile(pngPath)));
  const icoBuffer = await toIco(pngBuffers);
  await writeFile(outputPath, icoBuffer);
}

async function main() {
  await ensureReadable(sourceSvgPath);
  await ensureReadable(trayTemplateSvgPath);

  await mkdir(buildIconsDir, { recursive: true });
  await rm(iconsetDir, { recursive: true, force: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });
  await mkdir(tempDir, { recursive: true });

  await renderPng(256, iconPngPath);
  await renderPng(18, trayTemplatePngPath, trayTemplateSvgPath);
  await renderPng(36, trayTemplate2xPngPath, trayTemplateSvgPath);
  await createIco(iconIcoPath, icoSizes);
  await createIco(faviconPath, faviconSizes);

  for (const [size, fileName] of iconsetEntries) {
    await renderPng(size, join(iconsetDir, fileName));
  }

  run("iconutil", ["-c", "icns", iconsetDir, "-o", iconIcnsPath]);

  await rm(tempDir, { recursive: true, force: true });
  console.log("Generated application and tray icons from public SVG assets");
}

main().catch(async (error) => {
  await rm(tempDir, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});