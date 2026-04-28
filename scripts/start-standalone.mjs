import { buildRuntimeEnv } from "./runtime-env.mjs";

Object.assign(process.env, buildRuntimeEnv());

await import("../.next/standalone/server.js");