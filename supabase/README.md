# Verified product reviews

Apply `migrations/202609080001_verified_product_reviews.sql` as the database owner
before deploying the updated product page. It was applied to production on
2026-09-08 after a transaction-only rehearsal and authorization tests.

- The 87 existing `is_artificial = true` rows are retained for recovery but hidden
  by the public SELECT policy. They cannot appear in product cards or averages.
- Authenticated, non-anonymous buyers can post one real review per product only
  when an order belonging to them has the exact `items[].product_id` and status
  `entregue` (case/whitespace normalized). Purchasing a different product or
  having a pending/shipped order does not grant eligibility.
- `product_review_eligibility(text)` checks the current authenticated user. RLS,
  a database trigger and a unique index enforce the same restrictions for direct
  API requests. The storefront repeats the check immediately before uploading
  media and submitting the review.
- Customers cannot set delivery themselves, replace ordered items, change order
  ownership, or promote themselves through `profiles.is_admin`. The existing
  administrator and service backend retain their fulfillment access. Checkout
  can still create pending orders and update payment fields/status.
- Homepage customer testimonial images are unchanged.

`tests/verified_product_reviews.sql` uses a savepoint and rolls back every test
record. Run it inside an explicit outer transaction after the migration, then
roll back the outer transaction for a rehearsal. It does not send payments or
create permanent purchases/reviews. Do not run the migration twice: trigger and
index creation intentionally fail if already present.

Validation performed: exact product matching, pending and negative delivery
statuses, wrong buyer/product, anonymous sessions, duplicate reviews, artificial
review visibility/inserts, customer delivery tampering, admin flag tampering,
normal checkout payment updates, and administrator delivery confirmation.

This guards the review workflow; it is not a full payment/security audit.
