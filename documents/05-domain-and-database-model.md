# 05 — Canonical Domain & Database Architecture

## 1. Document Control
| Field | Value |
|---|---|
| Document Title | VenopAI Canonical Domain & Database Architecture |
| Document ID | VNP-DOC-05 |
| Version | 1.0 |
| Status | Approved |

## 2. Domain Map
The VenopAI system comprises the following primary domains:
- **Identity & Access (Auth, Users):** Users, Roles, Sessions, Credentials.
- **Catalog & Inventory (Catalog, Categories, Search, Inventory):** Products, Categories, Stock.
- **Order Management (Cart, Orders, Payments, Shipping):** Carts, Cart Items, Orders, Order Items, Payments, Shipments.
- **Service & Project Execution (Consultation, Design, Software, Manufacturing, Projects, Files, Quotes, Service Requests):** Projects, Service Requests (typed), Quotes, Quote Versions, Files.
- **Engagement & Operations (Reviews, Notifications, Admin, Analytics):** Product Reviews, User Notifications, Audit Logs.

## 3. Entity Inventory
### Identity Domain
- `User`: Core user account.
- `Role`: RBAC.
- `Address`: User shipping/billing addresses.

### Catalog Domain
- `Category`: Hierarchical taxonomy.
- `Product`: Buyable items (components, kits).
- `ProductImage`: Assets.

### Inventory Domain
- `Inventory`: Stock tracking and reservation.

### Order Domain
- `Cart`, `CartItem`: Pre-checkout.
- `Order`, `OrderItem`: Placed orders.
- `Payment`: Transaction records (Razorpay).
- `Shipment`: Tracking and logistics (Shiprocket).

### Service & Project Domain
- `Project`: Container for files and service requests.
- `ServiceRequest`: Abstract request (manufacturing, design, software, consultation).
- `Quote`, `QuoteVersion`: Pricing proposals for requests.
- `File`: Customer and admin uploaded files (Private/Shared).

### Engagement Domain
- `Review`: Ratings for products.
- `Notification`: System alerts.

## 4. Relationship Map
- User (1) -> (N) Address
- User (1) -> (N) Order
- User (1) -> (N) Project
- Category (1) -> (N) Product
- Product (1) -> (1) Inventory
- Order (1) -> (N) OrderItem
- Order (1) -> (1) Payment
- Order (1) -> (1) Shipment
- Project (1) -> (N) ServiceRequest
- Project (1) -> (N) File
- ServiceRequest (1) -> (N) Quote

## 5. State/Lifecycle Model
- **Order State:** PENDING -> PAID -> PROCESSING -> SHIPPED -> DELIVERED / CANCELLED
- **Service Request State:** SUBMITTED -> REVIEWING -> QUOTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
- **Quote State:** DRAFT -> ISSUED -> ACCEPTED / REJECTED / EXPIRED

## 6. Integrity Rules & Business Invariants
- **Payment/Quote Dependencies:** Service requests require an accepted quote before execution.
- **Quote Versioning:** Quotes are immutable once issued; revisions create new versions.
- **Customer Ownership:** Projects and Files are strictly scoped to the User.
- **Private Files:** Files must enforce RBAC visibility (Admin vs Customer).
- **Inventory Locks:** Stock is reserved on cart checkout, committed on payment, released on timeout.
- **Order Payment State:** Orders without successful payments within a window are marked abandoned.

## 7. Index Strategy
- PKs are UUIDs.
- Indexes on foreign keys (`user_id`, `product_id`, `project_id`).
- Unique constraint on User `email`.
- Indexes on status fields (`order.status`, `request.status`) for dashboard queries.
- GIN index on Product `name` and `description` for search (or basic B-Tree).
