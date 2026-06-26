import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

export function loadGasModules(files) {
  const context = vm.createContext({
    console,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Set,
    Array,
    String
  });

  for (const file of ["00_namespace.gs", ...files]) {
    const path = resolve("gas/src", file);
    new vm.Script(readFileSync(path, "utf8"), { filename: path }).runInContext(context);
  }

  return context.EvenUp;
}
