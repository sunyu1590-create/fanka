# Membership support plan compatibility

## Current implementation

- The account tier is read from `profiles.membership_tier` through the existing account/profile flow. Authorized staff changes continue to use the existing admin endpoint and database function.
- Base daily flip allowances are Free 5, Plus 9, and Pro 13. The current daily lucky bonus remains calculated separately and is added by the existing community state logic.
- `lib/membership-plans.ts` is the shared source for tier labels, display-only preview prices, and base quotas. UI changes must not change these values without a separate product and compatibility review.
- The current project has no membership plan preview API, checkout route, order table, or payment integration. The Plus/Pro “preview” action is a client-only notice; it does not send a request or alter membership state. Do not claim or create an existing API contract that is not present.
- The extra flip-pack selector is also a client-only preview. It does not create an order or add flips to the account.

## Compatibility constraints

1. Do not rename or remove `profiles.membership_tier`, the existing profile read flow, the authorized membership tier administration path, or the base allowance values.
2. Any future plan-preview endpoint must be additive and must not create payment, order, or membership side effects. Before it is introduced, document its path, request/response fields, and status-code contract here and add compatibility tests.
3. Real payment processing is out of scope until explicitly approved. No payment SDK or external billing provider is connected by the support-plan UI.
4. Account tier and actual quota enforcement must continue to come from the existing trusted application state; selecting a preview card must never grant a tier or extra flips.

## Regression tests

`tests/membership-plans.test.mjs` protects the Free/Plus/Pro quota values and display-only preview price labels. Run it with `npm test`.
