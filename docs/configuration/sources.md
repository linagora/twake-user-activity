# Source settings

Each source is off until its setting names an exchange; an empty value counts as unset. When set, the exchange must exist, or the bridge stops at startup.

- `BILLING_EXCHANGE`: cloudery's subscription exchange, usually `billing`. [Paying users](../sources/paying-users.md).
- `FEED_EXCHANGE`: the apps' feed, usually `activity`. [Feature counts](../sources/feature-counts.md).
- `AUTH_EXCHANGE`: where ldap-rest announces deleted B2C accounts, usually `auth`. [Erasure](../sources/erasure.md).
- `B2B_EXCHANGE`: where ldap-rest announces deleted organization members, usually `b2b`. [Erasure](../sources/erasure.md).

Every exchange the bridge reads must differ from the others and from the dead letter exchange.
