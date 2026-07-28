# Observability Baseline

This baseline implements reusable platform components selected by ADR 007 and
maps each required observable signal to a real producer.

## Requirement Coverage

| Requirement | Metric or log | Real producer | Dashboard or alert |
| --- | --- | --- | --- |
| API latency | `http_request_duration_seconds` | HTTP metrics middleware in all four services | Grafana `API p95 latency`, alert `HighApiLatency` |
| Kubernetes CPU | `container_cpu_usage_seconds_total` | Prometheus cAdvisor scrape | Grafana `Kubernetes CPU usage`, alert `HighContainerCpuUsage` |
| Kubernetes memory | `container_memory_working_set_bytes` | Prometheus cAdvisor scrape | Grafana `Kubernetes memory usage`, alert `HighContainerMemoryUsage` |
| Healthchecks and uptime | `up` | Prometheus scrape targets for services and platform pods | Grafana `Healthcheck uptime`, alert `ServiceUnavailable` |
| Structured correlated JSON logs | JSON log lines with `correlationId` and `sagaId` | Existing service logging and correlation middleware | Runtime log search through the log collector |
| Daily service-order volume | `order_created_total` | `os-service/src/order/application/services/order.service.ts` | Grafana `Daily service-order volume` |
| Order-processing failure alerting | `order_processing_failures_total` | `os-service/src/saga/application/saga-orchestrator.service.ts` | Grafana `Order processing failures`, alert `OrderProcessingFailures` |
| Average execution time by status | `order_execution_duration_seconds{status}` | `workshop-service/src/execution/application/services/execution.service.ts` | Grafana `Average execution time by status` |
| Integration failures | `integration_failures_total{service,integration}` | OS REST and RabbitMQ adapters, workshop RabbitMQ adapter, billing Mercado Pago and RabbitMQ adapters | Grafana `Integration failures`, alert `IntegrationFailures` |

## Platform Components

| Component | File |
| --- | --- |
| Prometheus scrape and alert rules | `k8s/observability/prometheus.yaml` |
| Grafana datasource and dashboards | `k8s/observability/grafana.yaml` |
| OTLP trace/metric receiver | `k8s/observability/otel-collector.yaml` |
| JSON pod log collector | `k8s/observability/otel-log-collector.yaml` |
| Shared correlation and logging configuration | `k8s/base/shared-config.yaml` |

Prometheus relabeling derives the dashboard labels from Kubernetes metadata on
service pod scrapes:

- `namespace` <- `__meta_kubernetes_namespace`
- `service` <- `__meta_kubernetes_pod_label_app_kubernetes_io_name`
- `pod` <- `__meta_kubernetes_pod_name`

## Metric Names Used By The Platform

| Metric | Type | Producer |
| --- | --- | --- |
| `http_request_duration_seconds` | Histogram | All HTTP services |
| `order_created_total` | Counter | `os-service` order creation success path |
| `order_processing_failures_total` | Counter | `os-service` when the Saga reaches `FAILED` or `MANUAL_INTERVENTION_REQUIRED` |
| `order_execution_duration_seconds` | Histogram | `workshop-service` execution transitions using persisted timestamps |
| `integration_failures_total` | Counter | Technical failures in REST, RabbitMQ and Mercado Pago adapters |
| `message_processing_duration_seconds` | Histogram | Broker consumers |
| `message_processing_failures_total` | Counter | Broker consumers |

## Log Contract

Services must write one JSON object per log line. The platform collector expects
these fields when available:

| Field | Required | Purpose |
| --- | --- | --- |
| `timestamp` | Yes | Event time |
| `level` | Yes | Log severity |
| `message` | Yes | Human-readable message |
| `service` | Yes | Producing service |
| `correlationId` | Yes for request handling | Cross-service request correlation |
| `sagaId` | Yes for Saga work | Saga flow correlation |
| `eventId` | Yes for message handling | Broker idempotency and traceability |

## Validation

Validate emitted metrics locally through the service test suites and `/metrics`
inspection:

- `order_created_total` increments once per successful order creation.
- `order_processing_failures_total` increments only when the Saga transitions
  to `FAILED` or `MANUAL_INTERVENTION_REQUIRED`.
- `order_execution_duration_seconds{status}` observes persisted durations for
  `diagnosis`, `repair` and `finished`.
- `integration_failures_total{service,integration}` uses only low-cardinality
  labels and never includes CPF, token, message text or entity identifiers.

Locate correlated logs by filtering JSON fields:

- `correlationId=<value>`
- `sagaId=<value>`

Live screenshots and runtime evidence depend on a cluster and remain part of
the final delivery stage.

Run:

```bash
npm run validate
kubectl kustomize k8s
```

`kubectl apply --dry-run=client` still requires an accessible API server for
discovery in some kubectl versions. Use a local `kind` cluster or a reachable
EKS context for that validation.
