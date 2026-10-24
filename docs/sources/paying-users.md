# Paying users

Cloudery publishes `subscription.changed` on `billing` when a user's plan changes, as plain JSON with `internalEmail` and `isPaying`. With `BILLING_EXCHANGE=billing`, the bridge binds it. An installation without cloudery, such as on premises, leaves it unset.

The hit belongs to the `billing` app, at cloudery's publish time, under the same pseudonym as the user's activity.

- PostHog gets a `subscription-paying` or `subscription-free` event that sets the person property `paying`, so an insight can count paying users at any date.
- Matomo has no per user property. The events land on the `billing` site, which shows changes over time, not a current count.
- The organization event `domain.subscription.changed` is not read: it names the domain only, not the organization id.

## Turning it off

Unset `BILLING_EXCHANGE`, then remove the binding the queue keeps, or every subscription change is dropped as a malformed activity:

```bash
rabbitmqadmin delete binding source=billing destination=user-activity.ingest \
  destination_type=queue properties_key=subscription.changed
```
