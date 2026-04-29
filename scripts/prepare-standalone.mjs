import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = process.cwd();
const standaloneRootDir = join(root, ".next", "standalone");
const standaloneNextDir = join(root, ".next", "standalone", ".next");
const staticSourceDir = join(root, ".next", "static");
const staticTargetDir = join(standaloneNextDir, "static");
const runtimeVendorRoot = join(root, "runtime-vendor");
const runtimeVendorNodeModulesDir = join(runtimeVendorRoot, "node_modules");
const appNodeModulesDir = join(root, "node_modules");
const standaloneNodeModulesDir = join(standaloneRootDir, "node_modules");
const standaloneNextNodeModulesDir = join(standaloneRootDir, ".next", "node_modules");
const require = createRequire(import.meta.url);
const runtimeRootPackages = ["prisma", "@prisma/client", "tsx"];
const prismaClientPackageJsonPath = require.resolve("@prisma/client/package.json");
const prismaClientPackageDir = dirname(realpathSync(prismaClientPackageJsonPath));
const prismaGeneratedSourceDirCandidates = [
  join(prismaClientPackageDir, ".prisma"),
  join(dirname(dirname(prismaClientPackageDir)), ".prisma"),
  join(root, "node_modules", ".prisma"),
];
const prismaGeneratedSourceDir = prismaGeneratedSourceDirCandidates.find((dirPath) => existsSync(dirPath));
const nextPackageJsonPath = require.resolve("next/package.json");
const nextRequire = createRequire(nextPackageJsonPath);

function findPackageDir(entryPath) {
  let currentDir = dirname(entryPath);

  while (true) {
    if (existsSync(join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Could not locate package.json for runtime dependency: ${entryPath}`);
    }

    currentDir = parentDir;
  }
}

function copyPackageDir(packageDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(packageDir, targetDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

function resolvePackageEntryPath(packageRequire, packageName) {
  try {
    return packageRequire.resolve(join(packageName, "package.json"));
  } catch {
    return packageRequire.resolve(packageName);
  }
}

function materializePrismaClient(targetPackageDir) {
  copyPackageDir(prismaClientPackageDir, targetPackageDir);

  if (existsSync(prismaGeneratedSourceDir)) {
    copyPackageDir(prismaGeneratedSourceDir, join(targetPackageDir, ".prisma"));
  }

  patchPrismaClientEntrypoints(targetPackageDir);
}

function patchPrismaClientEntrypoints(packageDir) {
  const entrypointContents = new Map([
    ["default.js", "module.exports = {\n  ...require('./.prisma/client/default'),\n}\n"],
    ["index.js", "module.exports = {\n  // https://github.com/prisma/prisma/pull/12907\n  ...require('./.prisma/client/default'),\n}\n"],
    ["edge.js", "module.exports = {\n  // https://github.com/prisma/prisma/pull/12907\n  ...require('./.prisma/client/edge'),\n}\n"],
    ["wasm.js", "module.exports = {\n  // https://github.com/prisma/prisma/pull/12907\n  ...require('./.prisma/client/wasm'),\n}\n"],
    ["sql.js", "module.exports = {\n  // https://github.com/prisma/prisma/pull/12907\n  ...require('./.prisma/client/sql'),\n}\n"],
    ["react-native.js", "module.exports = {\n  ...require('./.prisma/client/react-native'),\n}\n"],
    ["index-browser.js", "const prisma = require('./.prisma/client/index-browser')\n\nmodule.exports = prisma\n"],
  ]);

  for (const [fileName, fileContent] of entrypointContents) {
    const filePath = join(packageDir, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    writeFileSync(filePath, fileContent);
  }
}

mkdirSync(standaloneNextDir, { recursive: true });

if (existsSync(staticSourceDir)) {
  cpSync(staticSourceDir, staticTargetDir, { recursive: true, force: true, dereference: true });
}

rmSync(runtimeVendorRoot, { recursive: true, force: true });
mkdirSync(runtimeVendorNodeModulesDir, { recursive: true });

patchPrismaClientEntrypoints(prismaClientPackageDir);

if (existsSync(prismaGeneratedSourceDir)) {
  copyPackageDir(prismaGeneratedSourceDir, join(appNodeModulesDir, ".prisma"));
  copyPackageDir(prismaGeneratedSourceDir, join(runtimeVendorNodeModulesDir, ".prisma"));
  copyPackageDir(prismaGeneratedSourceDir, join(standaloneNodeModulesDir, ".prisma"));
  copyPackageDir(prismaGeneratedSourceDir, join(standaloneNextNodeModulesDir, ".prisma"));
}

materializePrismaClient(join(runtimeVendorNodeModulesDir, "@prisma", "client"));
materializePrismaClient(join(standaloneNodeModulesDir, "@prisma", "client"));

const standalonePrismaAliasDir = join(standaloneNextNodeModulesDir, "@prisma");

if (existsSync(standalonePrismaAliasDir)) {
  for (const entryName of readdirSync(standalonePrismaAliasDir)) {
    if (!entryName.startsWith("client-")) {
      continue;
    }

    materializePrismaClient(join(standalonePrismaAliasDir, entryName));
  }
}

const swcHelpersDir = findPackageDir(nextRequire.resolve("@swc/helpers"));
const nextEnvDir = findPackageDir(nextRequire.resolve("@next/env"));

copyPackageDir(swcHelpersDir, join(appNodeModulesDir, "@swc", "helpers"));
copyPackageDir(nextEnvDir, join(appNodeModulesDir, "@next", "env"));

const copiedPackages = new Set();
const packageQueue = runtimeRootPackages.map((packageName) => ({
  packageName,
  packageRequire: require,
  optional: false,
}));

while (packageQueue.length > 0) {
  const currentPackage = packageQueue.shift();

  if (!currentPackage || copiedPackages.has(currentPackage.packageName)) {
    continue;
  }

  let packageEntryPath;

  try {
    packageEntryPath = resolvePackageEntryPath(currentPackage.packageRequire, currentPackage.packageName);
  } catch (error) {
    if (currentPackage.optional) {
      continue;
    }

    throw error;
  }

  const packageDir = findPackageDir(packageEntryPath);
  const targetDir = join(runtimeVendorNodeModulesDir, currentPackage.packageName);
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const packageRequire = createRequire(join(packageDir, "package.json"));

  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(packageDir, targetDir, { recursive: true, force: true, dereference: true });
  copiedPackages.add(currentPackage.packageName);

  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    if (copiedPackages.has(dependencyName)) {
      continue;
    }

    packageQueue.push({
      packageName: dependencyName,
      packageRequire,
      optional: false,
    });
  }

  for (const dependencyName of Object.keys(packageJson.optionalDependencies ?? {})) {
    if (copiedPackages.has(dependencyName)) {
      continue;
    }

    packageQueue.push({
      packageName: dependencyName,
      packageRequire,
      optional: true,
    });
  }
}