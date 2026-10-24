# Local setup

Node 24 is required.

```bash
npm install
docker compose up -d   # RabbitMQ, which the tests and the service need
npm run dev            # starts the service, reading .env when present
npm run check          # lint, format check, type check, tests and build
```

The probes answer on port 8080 and the metrics on port 9464.

## With a local Matomo

Demo events from mail, chat and drive go through RabbitMQ and the bridge and show up in Matomo.

```bash
docker compose --profile matomo up -d --wait
scripts/matomo-setup.sh >> .env   # installs Matomo, one site per app, appends the settings
echo "AMQP_URL=amqp://guest:guest@localhost:5672" >> .env
grep -q '^PSEUDONYM_PEPPER=' .env || echo "PSEUDONYM_PEPPER=$(openssl rand -hex 32)" >> .env
echo "BILLING_EXCHANGE=billing" >> .env
npm run dev                       # leave it running: it declares the queue
npm run demo                      # in another terminal: a week of activity for 25 users, a third of them paying
docker compose exec matomo php console core:archive --url=http://localhost/
```

Open http://localhost:8081 (login `admin`, password `admin-local-only-1`). [Matomo](../backends/matomo.md) says where each report is.

Start the bridge before the demo: it declares the queue, and until then the exchange routes events nowhere. The demo publishes with the `mandatory` flag, so it stops with an error instead of losing them.
