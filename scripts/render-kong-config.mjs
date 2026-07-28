import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredVariables = [
  "AUTH_FUNCTION_URL",
  "CUSTOMER_SERVICE_URL",
  "OS_SERVICE_URL",
  "WORKSHOP_SERVICE_URL",
  "BILLING_SERVICE_URL",
  "JWT_ISSUER",
  "JWT_SHARED_SECRET",
];

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(rootDir, "config/kong/kong.yml.template");
const outputPath = resolve(rootDir, "generated/kong.yml");

const values = Object.fromEntries(
  requiredVariables.map((name) => [name, process.env[name]]),
);

for (const [name, value] of Object.entries(values)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

let rendered = await readFile(templatePath, "utf8");
for (const [name, value] of Object.entries(values)) {
  rendered = rendered.replaceAll(`\${${name}}`, value);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, rendered);
console.log(`Rendered Kong configuration: ${outputPath}`);
