import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const manifestRoots = ["k8s"];
const requiredFiles = [
  "k8s/kustomization.yaml",
  "k8s/base/namespaces.yaml",
  "k8s/base/shared-config.yaml",
  "k8s/base/kustomization.yaml",
  "k8s/gateway/kong.yaml",
  "k8s/messaging/rabbitmq.yaml",
  "k8s/observability/prometheus.yaml",
  "k8s/observability/grafana.yaml",
  "k8s/observability/otel-collector.yaml",
  "k8s/observability/otel-log-collector.yaml",
  "k8s/templates/service-config-template.yaml",
];

const requiredKinds = [
  "Namespace",
  "ConfigMap",
  "Secret",
  "Deployment",
  "DaemonSet",
  "StatefulSet",
  "Service",
  "ServiceAccount",
  "ClusterRole",
  "ClusterRoleBinding",
];

const requiredNames = [
  "tech-challenge-gateway",
  "tech-challenge-apps",
  "tech-challenge-messaging",
  "tech-challenge-observability",
  "kong-gateway",
  "rabbitmq",
  "prometheus",
  "grafana",
  "otel-collector",
  "otel-log-collector",
];

const failures = [];
const files = await collectYamlFiles(manifestRoots);

for (const requiredFile of requiredFiles) {
  if (!files.includes(requiredFile)) {
    failures.push(`Missing manifest file: ${requiredFile}`);
  }
}

for (const file of files) {
  const content = await readFile(file, "utf8");
  validateDocumentBoundaries(file, content);
  validateRequiredMetadata(file, content);
  validateNoRealSecrets(file, content);
}

const allContent = (
  await Promise.all(files.map((file) => readFile(file, "utf8")))
).join("\n");

for (const kind of requiredKinds) {
  if (!new RegExp(`^kind:\\s+${kind}\\s*$`, "m").test(allContent)) {
    failures.push(`Missing Kubernetes kind: ${kind}`);
  }
}

for (const name of requiredNames) {
  if (!new RegExp(`name:\\s+${escapeRegExp(name)}\\s*$`, "m").test(allContent)) {
    failures.push(`Missing Kubernetes resource name: ${name}`);
  }
}

if (!allContent.includes("orders.topic") || !allContent.includes("billing.topic")) {
  failures.push("RabbitMQ topic exchanges are not declared.");
}

if (!allContent.includes("OrderProcessingFailures")) {
  failures.push("Prometheus order processing alert is not declared.");
}

for (const requiredObservabilityText of [
  "HighApiLatency",
  "ServiceUnavailable",
  "HighContainerCpuUsage",
  "HighContainerMemoryUsage",
  "http_request_duration_seconds_bucket",
  "container_cpu_usage_seconds_total",
  "container_memory_working_set_bytes",
  "order_created_total",
  "order_execution_duration_seconds",
  "integration_failures_total",
  "filelog",
  "correlationId",
  "sagaId",
]) {
  if (!allContent.includes(requiredObservabilityText)) {
    failures.push(`Missing observability baseline entry: ${requiredObservabilityText}`);
  }
}

if (!allContent.includes("x-correlation-id") || !allContent.includes("x-saga-id")) {
  failures.push("Shared correlation headers are not declared.");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Kubernetes manifest validation passed for ${files.length} files.`);

async function collectYamlFiles(roots) {
  const result = [];

  for (const root of roots) {
    await walk(root, result);
  }

  return result.sort();
}

async function walk(path, result) {
  const entries = await readdir(path, { withFileTypes: true });

  for (const entry of entries) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) {
      await walk(next, result);
      continue;
    }

    if ([".yaml", ".yml"].includes(extname(entry.name))) {
      result.push(next);
    }
  }
}

function validateDocumentBoundaries(file, content) {
  if (!content.trim()) {
    failures.push(`Empty YAML file: ${file}`);
  }

  if (/\t/.test(content)) {
    failures.push(`YAML file contains tabs: ${file}`);
  }
}

function validateRequiredMetadata(file, content) {
  const documents = content.split(/^---\s*$/m).map((doc) => doc.trim()).filter(Boolean);

  for (const document of documents) {
    if (file.endsWith("kustomization.yaml")) {
      continue;
    }

    for (const field of ["apiVersion:", "kind:", "metadata:", "name:"]) {
      if (!document.includes(field)) {
        failures.push(`Manifest document in ${file} is missing ${field}`);
      }
    }
  }
}

function validateNoRealSecrets(file, content) {
  if (!file.includes("shared-config") && !file.includes("rabbitmq") && !file.includes("grafana")) {
    return;
  }

  const suspiciousSecret =
    /password:\s+(?!(replace-with|\$\{))[^\s]+|PASS:\s+(?!(replace-with|\$\{))[^\s]+|SECRET:\s+(?!(replace-with|\$\{))[^\s]+/i;
  if (suspiciousSecret.test(content)) {
    failures.push(`Manifest appears to contain a real secret: ${file}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
