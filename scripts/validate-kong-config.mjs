import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const templatePath = resolve("config/kong/kong.yml.template");
const template = await readFile(templatePath, "utf8");

const requiredPlaceholders = [
  "AUTH_FUNCTION_URL",
  "CUSTOMER_SERVICE_URL",
  "OS_SERVICE_URL",
  "WORKSHOP_SERVICE_URL",
  "BILLING_SERVICE_URL",
  "JWT_ISSUER",
  "JWT_SHARED_SECRET",
];

const requiredRoutes = [
  "auth-cpf-token",
  "customer-health",
  "customer-swagger",
  "customer-api",
  "os-health",
  "os-swagger",
  "os-public-status",
  "os-api",
  "workshop-health",
  "workshop-swagger",
  "workshop-api",
  "billing-health",
  "billing-swagger",
  "billing-public-budget-response",
  "billing-mercado-pago-webhook",
  "billing-api",
];

const protectedRoutes = [
  "customer-api",
  "os-api",
  "workshop-api",
  "billing-api",
];

const publicRoutes = [
  "auth-cpf-token",
  "customer-health",
  "customer-swagger",
  "os-health",
  "os-swagger",
  "os-public-status",
  "workshop-health",
  "workshop-swagger",
  "billing-health",
  "billing-swagger",
  "billing-public-budget-response",
  "billing-mercado-pago-webhook",
];

const failures = [];

for (const name of requiredPlaceholders) {
  if (!template.includes(`\${${name}}`)) {
    failures.push(`Missing placeholder: ${name}`);
  }
}

for (const routeName of requiredRoutes) {
  if (!template.includes(`name: ${routeName}`)) {
    failures.push(`Missing route: ${routeName}`);
  }
}

for (const routeName of protectedRoutes) {
  const block = routeBlock(template, routeName);
  if (!block.includes("name: jwt")) {
    failures.push(`Protected route lacks JWT plugin: ${routeName}`);
  }
  if (!block.includes("- protected")) {
    failures.push(`Protected route lacks protected tag: ${routeName}`);
  }
}

for (const routeName of publicRoutes) {
  const block = routeBlock(template, routeName);
  if (block.includes("name: jwt")) {
    failures.push(`Public route must not configure JWT plugin: ${routeName}`);
  }
  if (!block.includes("- public")) {
    failures.push(`Public route lacks public tag: ${routeName}`);
  }
}

if (
  /secret:\s+["']?(?!\$\{JWT_SHARED_SECRET\})[A-Za-z0-9+/=_-]{8,}/.test(
    template,
  )
) {
  failures.push("Template appears to contain a hardcoded JWT secret.");
}

if (/url:\s+["']?https?:\/\/(?!\$\{)/.test(template)) {
  failures.push("Template appears to contain a hardcoded upstream URL.");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Kong configuration template validation passed.");

function routeBlock(content, routeName) {
  const start = content.indexOf(`name: ${routeName}`);
  if (start === -1) {
    return "";
  }

  const rest = content.slice(start);
  const nextRoute = rest.slice(1).search(/\n\s{6}- name: /);
  const nextService = rest.slice(1).search(/\n\s{2}- name: /);
  const candidates = [nextRoute, nextService]
    .filter((index) => index >= 0)
    .map((index) => index + 1);
  const end = candidates.length > 0 ? Math.min(...candidates) : rest.length;
  return rest.slice(0, end);
}
