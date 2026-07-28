# Platform Foundation

This document describes the shared Kubernetes foundation created for Step 1.4.
It does not define microservice business deployments.

## Namespaces

| Namespace | Owner |
| --- | --- |
| `tech-challenge-gateway` | Kong Gateway |
| `tech-challenge-apps` | Shared application configuration and later service deployments |
| `tech-challenge-messaging` | RabbitMQ |
| `tech-challenge-observability` | Prometheus, Grafana and OpenTelemetry Collector |

## Shared Components

| Component | Manifest | Notes |
| --- | --- | --- |
| Kong Gateway | `k8s/gateway/kong.yaml` | DB-less deployment. The real route config is rendered from `config/kong/kong.yml.template` and applied as `kong-declarative-config`. |
| RabbitMQ | `k8s/messaging/rabbitmq.yaml` | Local Kubernetes broker with versioned topic exchanges and queues aligned to ADR 005. |
| Prometheus | `k8s/observability/prometheus.yaml` | Scrapes annotated pods/services and includes alert placeholders for order and integration failures. |
| Grafana | `k8s/observability/grafana.yaml` | Provisions Prometheus datasource and an order-flow dashboard baseline. |
| OpenTelemetry Collector | `k8s/observability/otel-collector.yaml` | Receives OTLP traces/metrics and logs them locally as a validation baseline. |
| OpenTelemetry Log Collector | `k8s/observability/otel-log-collector.yaml` | Reads JSON pod logs and extracts `correlationId`/`sagaId` for correlated evidence. |

## Secret Handling

Secret manifests contain placeholder values only. Replace them through a
deployment secret manager, sealed secret flow or CI/CD injection before cloud
deployment. Do not commit real credentials.

## Local Deployment

Render Kong configuration first:

```bash
npm run render:kong
kubectl create configmap kong-declarative-config \
  --namespace tech-challenge-gateway \
  --from-file=kong.yml=generated/kong.yml \
  --dry-run=client -o yaml | kubectl apply -f -
```

Apply the shared platform:

```bash
kubectl apply -k k8s
```

For local `kind`, expose services with port forwarding:

```bash
kubectl -n tech-challenge-gateway port-forward service/kong-proxy 8000:80
kubectl -n tech-challenge-observability port-forward service/grafana 3000:3000
kubectl -n tech-challenge-messaging port-forward service/rabbitmq 15672:15672
```

## Cloud Deployment

Use the same kustomization against the selected EKS context after cloud
credentials and secrets are configured:

```bash
kubectl config use-context replace-with-eks-context
kubectl apply -k k8s
```

Cloud-specific values such as load balancer annotations, secret manager
integration and production resource sizing must be added through explicit later
steps. This repository currently contains the shared foundation only.
