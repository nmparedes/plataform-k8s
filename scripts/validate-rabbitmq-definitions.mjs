import { readFile } from "node:fs/promises";

const sourcePath = "k8s/messaging/rabbitmq.yaml";
const manifest = await readFile(sourcePath, "utf8");
const definitions = extractDefinitions(manifest);

const requiredQueues = [
  "billing.budget.requests",
  "billing.payment.compensation.requests",
  "os.billing.events",
  "workshop.stock.requests",
  "workshop.execution.requests",
  "os.workshop.events",
];
const requiredRoutes = [
  ["orders.topic", "budget.requested"],
  ["orders.topic", "payment.refund.requested"],
  ["orders.topic", "stock.reserve.requested"],
  ["orders.topic", "stock.release.requested"],
  ["orders.topic", "execution.requested"],
  ["billing.topic", "budget.created"],
  ["billing.topic", "budget.approved"],
  ["billing.topic", "budget.rejected"],
  ["billing.topic", "payment.created"],
  ["billing.topic", "payment.approved"],
  ["billing.topic", "payment.failed"],
  ["billing.topic", "payment.refunded"],
  ["billing.topic", "payment.refund.failed"],
  ["workshop.topic", "stock.reserved"],
  ["workshop.topic", "stock.reservation.failed"],
  ["workshop.topic", "stock.released"],
  ["workshop.topic", "stock.release.failed"],
  ["workshop.topic", "execution.started"],
  ["workshop.topic", "execution.finished"],
  ["workshop.topic", "execution.failed"],
];

const queues = new Set(definitions.queues.map((queue) => queue.name));
const exchanges = new Set(definitions.exchanges.map((exchange) => exchange.name));
const failures = [];

for (const queue of requiredQueues) {
  if (!queues.has(queue)) failures.push(`Missing durable queue: ${queue}`);
}

for (const [exchange, routingKey] of requiredRoutes) {
  if (!exchanges.has(exchange)) {
    failures.push(`Missing exchange: ${exchange}`);
    continue;
  }
  if (!hasRoute(definitions.bindings, exchange, routingKey)) {
    failures.push(`No route for ${exchange}:${routingKey}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `RabbitMQ definitions JSON and routing validation passed for ${requiredRoutes.length} events.`,
);

function extractDefinitions(content) {
  const match = content.match(
    /\n  definitions\.json: \|\n(?<json>[\s\S]*?)\n  rabbitmq\.conf:/,
  );
  if (!match?.groups?.json) {
    throw new Error("RabbitMQ definitions JSON block was not found.");
  }

  const json = match.groups.json
    .split("\n")
    .map((line) => line.replace(/^    /, ""))
    .join("\n");
  return JSON.parse(json);
}

function hasRoute(bindings, exchange, routingKey) {
  return bindings.some(
    (binding) =>
      binding.source === exchange &&
      binding.destination_type === "queue" &&
      topicMatches(binding.routing_key, routingKey),
  );
}

function topicMatches(pattern, routingKey) {
  const patternParts = pattern.split(".");
  const keyParts = routingKey.split(".");
  let keyIndex = 0;

  for (const part of patternParts) {
    if (part === "#") return true;
    if (keyIndex >= keyParts.length) return false;
    if (part !== "*" && part !== keyParts[keyIndex]) return false;
    keyIndex += 1;
  }

  return keyIndex === keyParts.length;
}
