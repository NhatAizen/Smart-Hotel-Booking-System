# Customer daily pricing test flag

Booking Service reads `MANUAL_DAILY_CUSTOMER_PRICING_ENABLED`; the default is `false`.
Enable it only in an isolated test environment with the Manual Daily Pricing hotel migration applied.
Keep it off for real customers until the quote and booking flow is verified end to end.

When enabled, Booking Service fetches eligible daily rules from Hotel Service for Customer quotes
and booking creation. A rule takes effect immediately for its date range while its nightly price
remains between 50% and 125% of the room type's current approved base price. On covered nights
it replaces the room type base price, room `customPrice`, and weekend or special date surcharge.
Other nights retain existing pricing. Booking Service stores the computed nightly prices with
the booking. The room change flow continues to use the legacy pricing method.

The create booking API requires `expectedGrossAmount` and `expectedFinalAmount` when enabled.
It returns HTTP 409 with code `PRICE_CHANGED` when either amount differs or pricing changes
during creation. The Customer checkout reloads the quote and asks for a new confirmation.
The flag does not trigger wallet transfers, extra charges, or refunds.
