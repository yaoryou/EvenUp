import { createHash, randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve(".evenup-production.json");
const accessKey = randomBytes(32).toString("base64url");
const accessKeySha256 = createHash("sha256").update(accessKey, "utf8").digest("base64url");
const output = {
  generated_at: new Date().toISOString(),
  access_key: accessKey,
  access_key_sha256: accessKeySha256,
  spreadsheet_id: "",
  script_id: "",
  deployment_id: "",
  web_app_url: ""
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx", mode: 0o600 });
await chmod(outputPath, 0o600);
console.log(`Created ${outputPath}`);
console.log("The raw access key is stored only in this git-ignored file.");
