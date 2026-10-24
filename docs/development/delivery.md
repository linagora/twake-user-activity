# Delivery

- A pull request runs `npm audit` and `npm run check`, then builds the image and smoke tests it.
- A push to `main` publishes `ghcr.io/linagora/twake-user-activity:latest`.
- A tag `v<version>` publishes that version and a GitHub release. The tag must match the version in `package.json`.
