# Switching backends

1. Set `ANALYTICS_BACKEND` and the new backend's settings.
2. Roll the deployment.

History stays in the old backend: the bridge does not copy it. Pseudonyms are the same in both as long as `PSEUDONYM_PEPPER` does not change, so users can be matched across the two.

Apps need no change: they publish to RabbitMQ, never to the backend.
