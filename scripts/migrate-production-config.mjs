import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadGroups, selectGroup } from "./group-config.mjs";

const group = selectGroup(await loadGroups(), process.argv[2] || "fate");
const source = resolve(".evenup-production.json");
const directory = resolve(".evenup-groups");
const target = resolve(directory, `${group.id}.json`);
const contents = await readFile(source, "utf8");

JSON.parse(contents);
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(target, contents, { flag: "wx", mode: 0o600 });
await chmod(target, 0o600);
console.log(`Copied legacy configuration to ${target}`);
console.log("The legacy file was left in place. Remove it only after validating the new configuration.");
