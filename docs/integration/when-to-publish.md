# When to publish

Publish when the user does something worth counting: opening the app, sending a message, sharing a file. Do not publish on timers or background syncs the user did not trigger, unless you mark them `background` so reports can leave them out.

- For visits, hook where every authenticated request passes, not in each feature. One place sees the web, desktop and mobile clients alike, and knows the user and the client.
- Publish at most one visit (an event without `data.action`) per user, app and platform in a short window, such as every 5 minutes. A Redis `SET key 1 NX EX 300` before publishing does it across replicas. An app answers hundreds of requests per user per hour; the reports need one.
- Publish one event per meaningful action, with `data.action` set.
- Only a person counts. Skip bots, application services and technical accounts.
- An action an assistant took with the user's delegated token is not the user's activity. Do not publish `user.active` for it.

An app that already publishes its events on the `activity` feed gets [feature counts](../sources/feature-counts.md) with no new code. Publish `user.active` on top of it for the visits the feed does not see, such as opening the app.
