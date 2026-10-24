# Hook points

Where each app can publish from.

- Twake Calendar side service: its REST API builds one James `Authenticator` for every request ([`RestApiModule.java`](https://github.com/linagora/twake-calendar-side-service/blob/40a68918cce612d7d870551fc3aaf719d781bca1/calendar-rest-api/src/main/java/com/linagora/calendar/restapi/RestApiModule.java#L245)). Decorating it sees every authenticated user.
- Twake Mail: it runs on James too, so the same decoration fits its JMAP API.
- Meet: its backend sends analytics through a class picked by the `ANALYTICS_BACKEND` setting ([`core/analytics`](https://github.com/suitenumerique/meet/blob/75df71733a5e2c8d4f9aa47ac29059d7c6bbbf95/src/backend/core/analytics/base.py#L11)). A class whose `capture` publishes `com.twake.meet.user.active.v1` reports meetings with no change to Meet itself. Anonymous participants have no address and are not counted.
- An app that already publishes on the `activity` feed is counted from it, through [feature counts](../sources/feature-counts.md).
