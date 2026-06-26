import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import vm from "node:vm";

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = ["frontend/js", "scripts", "tests"]
  .flatMap((directory) => walk(directory))
  .filter((file) => [".js", ".mjs"].includes(extname(file)));

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const gasFiles = walk("gas/src").filter((file) => extname(file) === ".gs");
for (const file of gasFiles) {
  new vm.Script(readFileSync(file, "utf8"), { filename: file });
}

console.log(`Syntax check passed: ${files.length} JavaScript files, ${gasFiles.length} GAS files`);
