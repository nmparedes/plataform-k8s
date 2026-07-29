# API Gateway Route Table

The accepted API Gateway decision uses Kong Gateway in `platform-k8s`. The
gateway configuration is defined in `config/kong/kong.yml.template` and rendered
with environment values before deployment.

## Security Model

Only routes tagged as public are unauthenticated at the gateway. All service API
prefix routes are protected with Kong's JWT plugin. Services must still validate
JWTs locally, because gateway security is not the only trust boundary.

JWTs are issued by `auth-function`. Kong validates:

- JWT signature with `JWT_SHARED_SECRET`;
- issuer key from `JWT_ISSUER`;
- expiration claim (`exp`).

Secrets and service URLs are provided through environment variables. The
template must not contain real credentials or account-specific URLs.

## Public Routes

| Route name                       | Method        | Path                             | Upstream               |
| -------------------------------- | ------------- | -------------------------------- | ---------------------- |
| `auth-cpf-token`                 | `POST`        | `/auth/cpf`                      | `AUTH_FUNCTION_URL`    |
| `customer-health`                | `GET`         | `/customers/health`              | `CUSTOMER_SERVICE_URL` |
| `customer-swagger`               | `GET`         | `/customers/docs`                | `CUSTOMER_SERVICE_URL` |
| `os-health`                      | `GET`         | `/orders/health`                 | `OS_SERVICE_URL`       |
| `os-swagger`                     | `GET`         | `/orders/docs`                   | `OS_SERVICE_URL`       |
| `os-public-status`               | `POST`        | `/orders/public/status`          | `OS_SERVICE_URL`       |
| `workshop-health`                | `GET`         | `/workshop/health`               | `WORKSHOP_SERVICE_URL` |
| `workshop-swagger`               | `GET`         | `/workshop/docs`                 | `WORKSHOP_SERVICE_URL` |
| `billing-health`                 | `GET`         | `/billing/health`                | `BILLING_SERVICE_URL`  |
| `billing-swagger`                | `GET`         | `/billing/docs`                  | `BILLING_SERVICE_URL`  |
| `billing-public-budget-response` | `GET`, `POST` | `/billing/public/budgets`        | `BILLING_SERVICE_URL`  |
| `billing-mercado-pago-webhook`   | `POST`        | `/billing/webhooks/mercado-pago` | `BILLING_SERVICE_URL`  |

## Protected Routes

| Route name     | Path prefix  | Upstream               | Gateway protection |
| -------------- | ------------ | ---------------------- | ------------------ |
| `customer-api` | `/customers` | `CUSTOMER_SERVICE_URL` | JWT required       |
| `os-api`       | `/orders`    | `OS_SERVICE_URL`       | JWT required       |
| `workshop-api` | `/workshop`  | `WORKSHOP_SERVICE_URL` | JWT required       |
| `billing-api`  | `/billing`   | `BILLING_SERVICE_URL`  | JWT required       |

Specific public routes are declared before the broader protected prefixes. This
keeps public health/docs/webhook paths explicit while protecting service API
prefixes by default.

## Local Validation Strategy

This step does not require Kong to run locally. Validate the configuration with:

```bash
npm run validate
```

Render a local config with safe example values:

```bash
npm run render:kong
```

The rendered file is written to `generated/kong.yml`, which is intentionally
ignored by Git because it can contain environment-specific values.

## Deployment Notes

Later platform deployment steps should mount the rendered Kong declarative
configuration into Kong running in DB-less mode:

```bash
KONG_DATABASE=off
KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml
```

Kubernetes manifests, ingress/load balancer resources and cloud deployment are
owned by later platform steps.
