# Feature counts

The apps already publish what people do on `activity`, the feed Twake Space reads: `com.twake.tasks.task.assigned.v1`, `com.twake.calendar.event.accepted.v1` and so on. With `FEED_EXCHANGE=activity`, the bridge binds `com.twake.#` and counts each event a person did, so feature counts need no new publisher.

The hit belongs to the app in the type, under the pseudonym of `twakeactor`, with the object and action as its action: `task.assigned`.

The bridge skips, without a log:

- an event with no `time` or no `twakeactor` address: an organization token acted, or nobody did,
- a message it cannot read,
- a provisioned space,
- the `user.active` heartbeat, which the [activity](activity.md) source counts,
- an app the backend has no report for, such as an app missing from `MATOMO_SITES`.

An action an assistant took for its owner carries the owner as actor, so it counts as the owner's.

## Turning it off

Unset `FEED_EXCHANGE`, then remove the binding the queue keeps, or every feed event is dropped as a malformed activity:

```bash
rabbitmqadmin delete binding source=activity destination=user-activity.ingest \
  destination_type=queue properties_key=com.twake.%23
```
