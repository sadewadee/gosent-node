// The version lives in package.json and in src/core.ts (VERSION, sent as the
// X-Gosent-Sdk header). These tests fail when the two drift apart.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../dist/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const coreSrc = readFileSync(new URL("../src/core.ts", import.meta.url), "utf8");

test("VERSION in src/core.ts matches package.json", () => {
  const match = coreSrc.match(/^export const VERSION = "([^"]+)";$/m);
  assert.ok(match, "export const VERSION = \"...\"; not found in src/core.ts");
  assert.equal(match[1], pkg.version);
});

test("the built VERSION export matches package.json", () => {
  assert.equal(VERSION, pkg.version);
});
