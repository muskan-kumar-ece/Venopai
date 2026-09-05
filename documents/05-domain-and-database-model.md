# 05 — Canonical Domain & Database Architecture

## 1. Document Control
| Field | Value |
|---|---|
| Document Title | VenopAI Canonical Domain & Database Architecture (Corrected) |
| Document ID | VNP-DOC-05 |
| Version | 2.0 |
| Status | Approved |

## 2. Domain Map
The VenopAI system comprises the following primary domains:
- **Identity & Access:** Users, Addresses, Audit Logs.
- **Catalog & Inventory:** Products, Categories, Inventory, Inventory Reservations.
- **Order Management:** Carts, Cart Items, Orders, Order Items, Payments, Refunds, Shipments.
- **Service & Project Execution:** Projects, Project Files, Manufacturing Requests, Consultation Requests, Design Requests, Software Requests, Quotes, Quote Versions, Quote Approvals.
- **Engagement & Operations:** Product Reviews, User Notifications.

## 3. Entity Inventory
The database contains 25 exact entities corresponding to PostgreSQL tables, using `UUID` for identifiers and `Integer` (cents) for money. Timestamps are timezone-aware.

### Identity Domain
- `User`: Core user account.
- `Address`: User shipping/billing addresses.
- `AuditEvent`: Security and operation audit logging.

### Catalog Domain
- `Category`: Hierarchical taxonomy.
- `Product`: Buyable items (components, kits).
- `Inventory`: Current stock levels for products.
- `InventoryReservation`: Temporary lock on inventory for active checkouts.

### Order Domain
- `Cart`, `CartItem`: Pre-checkout active baskets.
- `Order`, `OrderItem`: Placed orders.
- `Payment`: Transaction attempts (1:N against Order or Quote).
- `Refund`: Records of reversed transactions.
- `Shipment`: Tracking and logistics (Shiprocket).

### Service & Project Domain
- `Project`: Core container for service engagements.
- `ProjectFile`: Customer and admin uploaded files linked to projects.
- `ManufacturingRequest`: Request for PCBA / Box Build.
- `ConsultationRequest`: Request for consulting.
- `DesignRequest`: Request for hardware design.
- `SoftwareRequest`: Request for firmware/software.
- `Quote`: Pricing proposal container linked to a project.
- `QuoteVersion`: Iteration of a quote (immutable amounts/details).
- `QuoteApproval`: Explicit acceptance record of a quote version.

### Engagement Domain
- `Review`: Ratings for products.
- `Notification`: System alerts for users.

## 4. Relationship Map
- User (1) -> (N) Address, (N) Order, (N) Project, (N) AuditEvent
- Category (1) -> (N) Product
- Product (1) -> (1) Inventory
- Inventory (1) -> (N) InventoryReservation
- Cart (1) -> (N) CartItem
- Order (1) -> (N) OrderItem, (N) Payment, (N) Refund, (1) Shipment
- Payment (1) -> (N) Refund
- Project (1) -> (N) ProjectFile, (N) ManufacturingRequest, (N) ConsultationRequest, (N) DesignRequest, (N) SoftwareRequest, (N) Quote
- Quote (1) -> (N) QuoteVersion, (N) Payment
- QuoteVersion (1) -> (1) QuoteApproval
- User (1) -> (N) Review, (N) Notification

## 5. State/Lifecycle Model
- **Order State:** PENDING -> PAID -> PROCESSING -> SHIPPED -> DELIVERED / CANCELLED
- **Request State:** SUBMITTED -> REVIEWING -> QUOTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
- **Quote State:** DRAFT -> ISSUED -> ACCEPTED / REJECTED / EXPIRED

## 6. Integrity Rules & Business Invariants
- **Money:** Stored exclusively as Integer (cents).
- **Time:** Stored as `DateTime(timezone=True)` using UTC.
- **Payment Ownership:** Payment can belong to an Order OR a Quote. Multiple payments can exist per Order for retries.
- **Quote Approval Flow:** Quotes are iteration-based (`QuoteVersion`). A user creates a `QuoteApproval` referencing a specific `QuoteVersion`.
- **Inventory Locks:** Stock is reserved on cart checkout (`InventoryReservation`), committed on payment, released on timeout.

## 7. Index Strategy
- PKs are UUIDs.
- Indexes on foreign keys (`user_id`, `product_id`, `project_id`).
- Unique constraint on User `email`.
- Indexes on status fields (`order.status`, `request.status`) for dashboard queries.
