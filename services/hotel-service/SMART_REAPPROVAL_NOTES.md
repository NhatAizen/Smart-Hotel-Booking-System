# Hotel Service - Smart Room Type Re-approval

This package is based on the `hotel-service.zip` supplied by the user in the current conversation.

Added/updated:
- RoomType.java
- RoomTypeService.java
- Flyway migration `V20260818.01__room_type_smart_reapproval.sql`

Rules for an already APPROVED room type:
- Description / amenities / images / cover image / breakfast / smoking / physical-room quantity:
  no re-approval.
- Price increase <= 25% from the last approved baseline:
  no re-approval.
- Name, capacity, bed configuration, area, refund/payment/deposit policy:
  re-approval required.
- Price increase > 25% from last approved baseline:
  re-approval required.

The approved baseline price is persisted so repeated small increases cannot bypass the 25% rule.

After replacing the service, rebuild it with Docker Compose so Flyway runs the new migration.
