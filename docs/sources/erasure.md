# Erasure

ldap-rest announces a deleted account on `auth` (`user.deleted`, a B2C account) and on `b2b` (`domain.user.deleted`, an organization member, including every member of a deleted organization). With `AUTH_EXCHANGE` and `B2B_EXCHANGE` set, the bridge erases everything the backend holds under that user's pseudonym. Set either one or both.

Erasure is off by default, and turning it on is a legal decision for each deployment, not an operational one. It changes history: the backend rebuilds past reports without the user, so the active user counts of earlier months drop after the fact.

- Matomo deletes the user's visits and actions on every site and rebuilds the reports built from them. Its token needs `admin` access to the app sites ([Access](../security/access.md)).
- PostHog deletes the person and the events captured before the request, with a personal API key.
- A deletion without an address is logged and dropped: there is no pseudonym to erase.
- An erasure the backend refuses for good goes to the dead letter queue, so it is never lost.
- A hit can still land after the erasure: one another replica is sending at that moment, or an event retried later or replayed from the dead letter queue. Nothing erases it again. A deleted user produces no new activity, so only events already queued can do this.

## Turning it off

Unset the exchange, then remove the binding the queue keeps:

```bash
rabbitmqadmin delete binding source=auth destination=user-activity.ingest \
  destination_type=queue properties_key=user.deleted
rabbitmqadmin delete binding source=b2b destination=user-activity.ingest \
  destination_type=queue properties_key=domain.user.deleted
```
