# 02 — Technical Requirements & System Architecture

## VenopAI V1 Technical Requirements & System Architecture

---

## 1. Document Control

| Field | Value |
|---|---|
| Document Title | VenopAI V1 Technical Requirements & System Architecture |
| Document ID | VNP-DOC-02 |
| Version | 1.0 |
| Status | Approved for downstream use (foundation for Documents 03 and 04) |
| Authority | Sole authoritative source for VenopAI's technical architecture, backend structure, data model, and infrastructure decisions for V1 |
| Purpose | Translate the product requirements in Document 01 into an implementation-grade technical architecture, without redesigning the product or expanding scope |
| Intended Audience | Backend engineers, frontend engineers, database engineers, DevOps/infrastructure engineers, security reviewers, QA engineers, AI coding agents |
| Source Document | `01-core-product-requirements.md` (VNP-DOC-01) |
| Relationship to Document 01 | This document implements Document 01. It does not alter product scope, business rules, or workflows. Every architectural decision here traces to a specific requirement in Document 01 |
| Precedence Rules | Where this document appears to conflict with Document 01 on product behavior or business rules, Document 01 prevails and this document must be corrected. Where this document conflicts with itself, the most specific section (e.g., a named business rule mapping) prevails over the general narrative |
| Change Control | A change to product scope or business rules requires Document 01 to be revised first; a change to technical approach that does not alter product behavior may be revised here directly, with a version increment |

---

## 2. Architectural Executive Summary

VenopAI V1 is built as a **modular monolith**: one Next.js frontend and one FastAPI backend, backed by PostgreSQL as the single transactional source of truth, with Redis and Celery handling caching and durable background work. External capabilities the business does not need to own — payment collection, shipping logistics, file storage, and email delivery — are integrated through thin provider abstractions (Razorpay, Shiprocket, Cloudinary, Resend) rather than built in-house.

- **Frontend:** Next.js + React + TypeScript, deployed on Vercel. Serves the customer-facing storefront/account experience and the admin operations console (as a protected section of the same application, or a separate Next.js app sharing the same backend — see Section 6).
- **Backend:** a single FastAPI application, deployed on Render, organized internally into domain modules (Section 6/8) mirroring Document 01's product modules.
- **Database:** PostgreSQL (managed), the authoritative store for all business entities — products, inventory, orders, quotes, manufacturing/service requests, files metadata, reviews, notifications, audit events.
- **Cache/session support:** Upstash Redis, used for caching, rate limiting, and as the Celery broker/result backend.
- **Background jobs:** Celery workers (using Redis as broker) handle durable async work — reservation expiry, email sending, webhook retry, shipment sync, scheduled reconciliation.
- **File storage:** Cloudinary holds actual file bytes (public product media and private project files); PostgreSQL holds file metadata and access-control relationships.
- **Payments:** Razorpay is the sole payment gateway, integrated via a `PaymentGateway` abstraction with a `RazorpayProvider` implementation.
- **Shipping:** Shiprocket is the sole shipping provider, integrated via a `ShippingProvider` abstraction with a `ShiprocketProvider` implementation.
- **Email:** Resend is the sole email provider (V1 is email-only per Document 01, Section 17).
- **Monitoring:** Sentry for error tracking across frontend and backend.
- **Edge/DNS:** Cloudflare in front of both Vercel and Render for DNS, TLS, and basic edge protection.
- **CI/CD:** GitHub + GitHub Actions, deploying to Vercel (frontend) and Render (backend) on merge to the appropriate branch.

### High-Level Architecture Diagram

```
                                    Internet
                                       │
                                  Cloudflare (DNS, TLS, edge)
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
                 Vercel                                  Render
              Next.js (Web + Admin UI)              FastAPI (Modular Monolith)
                    │                                      │
                    │  HTTPS / REST (/api/v1) + Webhooks    │
                    └──────────────────┬───────────────────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
           PostgreSQL            Upstash Redis           Celery Workers
       (source of truth)      (cache, broker,           (background jobs,
                                rate limiting)            scheduled tasks)
                 │                     │                     │
                 └─────────────────────┴─────────────────────┘
                                       │
                          External Provider Integrations
        ┌───────────────┬───────────────┬───────────────┬───────────────┐
        │               │               │               │               │
     Razorpay       Shiprocket      Cloudinary        Resend          Sentry
   (payments)       (shipping)   (file/media storage) (email)   (error monitoring,
                                                                  both frontend/backend)
```

Webhooks from Razorpay and Shiprocket land on dedicated FastAPI endpoints, are verified, and are processed idempotently (Sections 14, 15, 26).

---

## 3. Architectural Principles

1. **Modular monolith.** One deployable backend, internally organized into strong domain modules with explicit boundaries — not a distributed system.
2. **API-first.** The Next.js frontend and any future client consume the same versioned REST API (`/api/v1`); no logic is duplicated in the frontend that the backend should own.
3. **Domain-oriented modules.** Each module (auth, catalog, orders, manufacturing, quotes, etc.) owns its data and business rules; cross-module access happens through service interfaces, not direct cross-module table access.
4. **Separation of concerns.** Routers handle HTTP; services hold business logic; repositories hold persistence; models define the schema (Section 7).
5. **PostgreSQL as transactional source of truth.** No external provider (Razorpay, Shiprocket, Cloudinary) is ever treated as authoritative for VenopAI's own business state (Section 4).
6. **External provider abstraction.** Every third-party integration sits behind an interface (`PaymentGateway`, `ShippingProvider`, `FileStorageProvider`, `EmailProvider`) so the concrete provider can change without touching business logic.
7. **Secure-by-default.** Authenticated by default; explicit authorization checks on every state-changing action; private files by default (Document 01, FILE-001).
8. **Private file access.** No file is ever publicly reachable by default; access is mediated by the backend (Section 16).
9. **Idempotent external operations.** Every webhook handler and every retried external call is designed so re-processing the same event has no duplicate effect (Section 26).
10. **Background processing for durable async work.** Anything that must survive a process restart, needs retries, or is not required to complete within the HTTP request lifecycle runs in Celery, not in-request (Section 18).
11. **Explicit transactions.** Multi-step writes that must succeed or fail together (e.g., reservation creation, order creation on payment confirmation) are wrapped in explicit database transactions.
12. **Observable operations.** Errors are captured centrally (Sentry); significant business events are audit-logged (Document 01, Section 23, AUDIT-001/002).
13. **Budget-first infrastructure.** Managed services (Render, Upstash, managed PostgreSQL) over self-hosted infrastructure; no infrastructure introduced without a requirement driving it.
14. **Incremental scalability.** The modular monolith is structured so a module could be extracted into its own service later if load genuinely demands it — but this is not built preemptively.
15. **Avoid premature distributed architecture.** No Kubernetes, no service mesh, no message broker beyond Celery's use of Redis, no multi-region deployment in V1.

---

## 4. System Boundaries

### Inside VenopAI (owned, authoritative)

- Next.js frontend (customer + admin UI)
- FastAPI backend and all domain modules
- PostgreSQL (all business data)
- Redis (cache, broker) and Celery (workers)
- Authentication and session/token management
- Authorization/RBAC
- Order logic, inventory logic, quote logic, manufacturing/service-request logic
- File **metadata** and access-control relationships
- Notification orchestration (deciding *what* to send and *when*)
- Analytics aggregation
- Audit logging

### Outside VenopAI (external, non-authoritative)

- **Razorpay** — payment collection and verification mechanics only.
- **Shiprocket** — shipping label generation, rate lookup, and carrier tracking only.
- **Cloudinary** — physical storage of file bytes only.
- **Resend** — email transport only.
- **Cloudflare** — DNS, TLS termination, edge protection only.
- **Sentry** — error/exception capture only.

### Source-of-Truth Statement

VenopAI's own PostgreSQL database is the source of truth for: product data, prices, inventory (available/reserved), orders, order status, payment status (as recorded after verification), quote state and version history, manufacturing/service request state, customer accounts, project file metadata, reviews, and all business rules.

- **Razorpay is not the source of truth for VenopAI order state.** A Razorpay-side payment event only updates VenopAI's `Payment` record after signature verification; `Order` status changes follow from that verified `Payment` record, never directly from Razorpay.
- **Shiprocket is not the source of truth for VenopAI order state.** Shiprocket tracking events update VenopAI's `Shipment` record; `Order` status reflects VenopAI's own `Shipment` state, not a live Shiprocket query on every read.
- **Cloudinary is not the source of truth for VenopAI project/file metadata.** Cloudinary holds bytes and returns a reference (URL/public ID); VenopAI's `File` table is authoritative for ownership, association, and access control.

---

## 5. Technology Stack

| Layer | Technology | Purpose | V1 |
|---|---|---|---|
| Frontend framework | Next.js (React, TypeScript) | Customer storefront/account UI and admin console | Yes |
| Frontend hosting | Vercel | Managed hosting, CDN, preview deployments | Yes |
| Backend framework | FastAPI (Python) | API-first backend, async-capable, strong typing via Pydantic | Yes |
| Data validation | Pydantic v2 | Request/response schema validation, satisfies API-first principle | Yes |
| ORM | SQLAlchemy 2.x | Type-safe data access over PostgreSQL | Yes |
| Migrations | Alembic | Versioned, reviewable schema migrations | Yes |
| Database | PostgreSQL (managed) | Transactional source of truth; supports full-text/trigram search (Document 01, Section 27) without a separate search platform | Yes |
| Cache / broker | Redis (Upstash) | Caching, rate limiting, Celery broker/result backend | Yes |
| Background jobs | Celery | Durable async work, retries, scheduled tasks | Yes |
| File/media storage | Cloudinary | Public media and private file storage with access-controlled delivery | Yes |
| Payment gateway | Razorpay | Sole V1 payment provider (Document 01, PAY-001) | Yes |
| Shipping provider | Shiprocket | Sole V1 shipping provider (Document 01, SHIP-001) | Yes |
| Email | Resend | Sole V1 notification channel (Document 01, NOTIF-001) | Yes |
| DNS / edge | Cloudflare | DNS, TLS, basic edge protection | Yes |
| Error monitoring | Sentry | Frontend + backend error tracking | Yes |
| Source control | GitHub | Version control, code review | Yes |
| CI/CD | GitHub Actions | Test, build, deploy pipelines to Vercel/Render | Yes |
| Backend hosting | Render | Managed application hosting for FastAPI + Celery workers | Yes |

Every entry above exists because a specific Document 01 requirement needs it — there is no addition beyond the locked technical direction.

---

## 6. Backend Architecture

The backend is a single FastAPI application organized as a modular monolith:

```
backend/
└── app/
    ├── main.py                 # FastAPI app instantiation, router registration, middleware
    ├── core/                   # cross-cutting concerns: settings loader, logging, exceptions
    ├── config/                 # environment-specific configuration
    ├── db/                     # SQLAlchemy engine/session setup, base model
    ├── security/               # password hashing, JWT issuance/verification, RBAC primitives
    ├── common/                 # shared schemas (pagination, error envelope), shared utilities
    │
    ├── modules/
    │   ├── auth/                # registration, login, verification, password reset
    │   ├── users/                # profile, addresses
    │   ├── catalog/              # products, product detail
    │   ├── categories/           # category hierarchy
    │   ├── search/               # product search/filter/sort
    │   ├── cart/                 # cart management (no reservation)
    │   ├── inventory/            # stock, reservation lifecycle
    │   ├── orders/                # order lifecycle, snapshots
    │   ├── payments/              # payment records, gateway abstraction
    │   ├── shipping/              # shipment records, provider abstraction
    │   ├── manufacturing/         # manufacturing request lifecycle
    │   ├── consultation/           # consultation request lifecycle
    │   ├── design/                 # PCB/design request lifecycle
    │   ├── software/               # software/firmware request lifecycle
    │   ├── projects/                # conceptual grouping of related requests (see Doc 01 §34)
    │   ├── files/                   # file metadata, access control
    │   ├── quotes/                  # quote + quote version lifecycle
    │   ├── reviews/                 # review submission/moderation
    │   ├── notifications/            # notification orchestration
    │   ├── admin/                    # role management, admin-only aggregation endpoints
    │   └── analytics/                 # operational reporting
    │
    ├── integrations/
    │   ├── razorpay/                  # RazorpayProvider implementation
    │   ├── shiprocket/                 # ShiprocketProvider implementation
    │   ├── cloudinary/                  # CloudinaryProvider implementation
    │   └── resend/                       # EmailProvider (Resend) implementation
    │
    ├── workers/                          # Celery app, task definitions, beat schedule
    └── tests/                             # unit, integration, and contract tests per module
```

Each module under `modules/` follows the same internal shape: `router.py`, `schemas.py`, `service.py`, `repository.py`, `models.py`, `exceptions.py`. Manufacturing, Consultation, Design, and Software share a common base implementation (a generic "service request" pattern) to avoid duplicating the same state machine four times, while remaining separate modules so their role-based access and module-specific fields (Document 01, Sections 7.12–7.15) stay distinct.

**Module responsibilities (summary):**

| Module | Responsibility | Depends on |
|---|---|---|
| auth | Identity, credentials, tokens | users, notifications |
| users | Profile, addresses | auth |
| catalog | Product data | categories, inventory (read) |
| categories | Category hierarchy | catalog |
| search | Query catalog | catalog, categories |
| cart | Pre-purchase selection | catalog (read), inventory (read) |
| inventory | Stock + reservation | orders (writes on payment) |
| orders | Commerce transaction lifecycle | cart, inventory, payments, shipping |
| payments | Payment record + gateway abstraction | orders, quotes |
| shipping | Shipment record + provider abstraction | orders, manufacturing/design |
| manufacturing / consultation / design / software | Service-request lifecycle | files, quotes, payments |
| projects | Grouping of related requests | manufacturing/consultation/design/software |
| files | File metadata + access control | manufacturing/consultation/design/software |
| quotes | Quote + version lifecycle | manufacturing/consultation/design/software, payments |
| reviews | Feedback capture/moderation | orders, service-request modules |
| notifications | Orchestrate outbound email | every module that produces a state transition |
| admin | Role-scoped aggregation and management endpoints | every module |
| analytics | Reporting aggregation | orders, payments, inventory, quotes |

---

## 7. Internal Application Layers

Every request follows the same layered flow:

```
HTTP Request
   │
   ▼
Router            — defines the endpoint, declares request/response schemas, delegates immediately
   │
   ▼
Schema Validation — Pydantic validates and coerces the incoming payload
   │
   ▼
Authentication    — resolves the caller's identity from the access token
   │
   ▼
Authorization     — checks the identity's role/permission against the requested action (Section 21)
   │
   ▼
Application Service — orchestrates the use case; the only place business rules live
   │
   ▼
Domain/Business Logic — enforces invariants (e.g., "no payment before quote approval")
   │
   ▼
Repository        — translates domain operations into persistence calls
   │
   ▼
SQLAlchemy        — issues SQL within an explicit transaction where needed
   │
   ▼
PostgreSQL
```

**Why business logic must not live in route handlers:** route handlers are I/O adapters, not business owners. Placing rules like "a quote can only be paid if Approved and not superseded" directly in a router makes that rule untestable without an HTTP client, unreachable from Celery tasks that need the same rule, and easy to accidentally duplicate (and desynchronize) across multiple endpoints that touch the same entity. Services are the single place each business rule from Document 01 is implemented.

**Layer responsibilities:**
- **Routers** — HTTP concerns only: path, method, status codes, request/response schema wiring.
- **Schemas** — Pydantic models defining the external contract; never exposed as the internal domain representation.
- **Services** — implement use cases and business rules; the only layer allowed to enforce cross-entity invariants.
- **Repositories** — the only layer allowed to issue SQLAlchemy queries; no business logic.
- **Models** — SQLAlchemy ORM classes; define schema, not behavior.
- **Domain rules** — encoded as guard clauses/validators inside services (e.g., `QuoteService.approve()` raises if the quote is not in `SENT`/`VIEWED`).
- **Integrations** — implement the provider-abstraction interfaces; contain no business logic, only translation to/from the external API.
- **Workers** — Celery tasks call the same services as routers do; they never re-implement business logic separately.

---

## 8. Domain Module Architecture

For each module: responsibility, owned data, inbound/outbound dependencies, key services, transactional requirements.

**AUTH** — Owns: credentials, tokens, verification/reset tokens. Inbound: users, notifications (to send verification/reset emails). Outbound: none. Key services: `RegisterUser`, `VerifyEmail`, `Login`, `RefreshToken`, `RequestPasswordReset`, `ResetPassword`. Transactional: user creation and initial verification-token creation happen in one transaction.

**USERS** — Owns: profile fields, addresses. Inbound: auth. Outbound: none required by other modules beyond read access. Key services: `UpdateProfile`, `AddAddress`, `SetDefaultAddress`. Transactional: address default-switching (unset old default, set new) is one transaction.

**CATALOG** — Owns: product records (name, description, specs, price, status). Inbound: categories, inventory (read-only stock status for display). Outbound: cart, orders (read at time of action). Key services: `GetProduct`, `ListProducts`, `CreateProduct` (admin), `UpdateProduct` (admin). Transactional: not required beyond standard row-level writes.

**CATEGORIES** — Owns: category hierarchy (max two levels, Document 01 CAT-010/011). Inbound: none. Outbound: catalog, search. Key services: `ListCategories`, `CreateCategory` (admin).

**SEARCH** — Owns: no data of its own; queries catalog/categories using PostgreSQL full-text/trigram indexes. Key services: `SearchProducts`.

**CART** — Owns: cart, cart items (per authenticated customer). Inbound: catalog (read), inventory (soft-check read only — CART-001, never a reservation). Outbound: orders/checkout (reads cart to build a reservation + order). Key services: `AddToCart`, `UpdateQuantity`, `RemoveFromCart`, `GetCart`.

**INVENTORY** — Owns: stock, reserved quantity, individual reservation records. Inbound: cart (read), orders (writes: create reservation, consume reservation, release reservation). Outbound: none. Key services: `CheckAvailability`, `CreateReservation`, `ReleaseReservation`, `ConsumeReservation`. Transactional: reservation creation/consumption must use row-level locking (Section 12) to prevent overselling.

**ORDERS** — Owns: order, order items (with price/tax snapshots). Inbound: cart, inventory, payments (payment-confirmed event triggers order creation). Outbound: shipping, reviews (eligibility), notifications. Key services: `CreateOrderFromCheckout`, `ConfirmOrderOnPayment`, `CancelOrder`, `GetOrder`. Transactional: order + order-items + reservation-consumption is one transaction (Section 13).

**PAYMENTS** — Owns: payment records (one per transaction attempt), refund records. Inbound: orders (commerce), quotes (service). Outbound: orders, manufacturing/design/software/consultation modules (payment-confirmed event unlocks execution). Key services: `InitiatePayment`, `VerifyPayment`, `HandleWebhook`, `IssueRefund`. Transactional: payment status update and the downstream order/quote-state transition happen atomically (Section 14).

**SHIPPING** — Owns: shipment records. Inbound: orders, manufacturing/design (when a physical deliverable is ready). Outbound: notifications. Key services: `CheckServiceability`, `GetRateAndETA`, `CreateShipment`, `SyncTrackingStatus`.

**MANUFACTURING / CONSULTATION / DESIGN / SOFTWARE** — Owns: request records, status history. Inbound: files (association), quotes, payments. Outbound: shipping (for physical deliverables), files (deliverables), reviews (eligibility), notifications. Key services: `SubmitRequest`, `RequestClarification`, `ConfirmRequirement`, `TransitionStatus`, `CancelRequest`. Transactional: status transitions are guarded to prevent invalid jumps (Section 22 state models).

**PROJECTS** — Owns: the conceptual grouping linking related requests for a customer (Document 01, Section 34 — open question resolved here as a lightweight grouping entity, not a heavy transactional object). Inbound: manufacturing/consultation/design/software. Outbound: customer account view.

**FILES** — Owns: file metadata (owner, associated request, MIME type, size, storage reference, scan status). Inbound: manufacturing/consultation/design/software (association target). Outbound: cloudinary integration (storage), notifications (upload/scan failure). Key services: `UploadFile`, `ValidateAndScan`, `GetDownloadURL`, `DeleteFile`. Transactional: metadata row is created in a `PENDING_SCAN` state before the file is exposed for download (Section 16).

**QUOTES** — Owns: quote and quote-version records, approval history. Inbound: manufacturing/consultation/design/software. Outbound: payments (approved-quote gate), notifications. Key services: `CreateQuote`, `ReviseQuote` (creates new version, supersedes prior), `ApproveQuote`, `RejectQuote`, `ExpireQuotes` (scheduled). Transactional: creating a new version and marking the prior version superseded happen atomically (Section 11 of Document 01; QUOTE-003).

**REVIEWS** — Owns: review records. Inbound: orders (delivered), service-request modules (completed). Outbound: none. Key services: `SubmitReview`, `ModerateReview`.

**NOTIFICATIONS** — Owns: notification log records (sent/failed). Inbound: every module producing a listed event (Document 01, Section 17). Outbound: resend integration. Key services: `Notify(event, recipient, context)` — a single entry point other modules call; internally dispatches a Celery task.

**ADMIN** — Owns: no independent business data beyond role assignment; exposes role-scoped views/actions across other modules. Key services: role-checked pass-throughs to the relevant module's service layer.

**ANALYTICS** — Owns: no independent transactional data; issues read-only aggregation queries against orders, payments, inventory, quotes, service-request modules. Key services: `GetOrdersReport`, `GetQuoteConversionReport`, etc.

No module in this list is a separate deployable service; each is a Python package within the single FastAPI application.

---

## 9. Database Architecture

Major entities, derived directly from Document 01 (Section 26), with purpose, ownership, key relationships, and lifecycle:

| Entity | Purpose | Owning Module | Key Relationships | Lifecycle |
|---|---|---|---|---|
| User | Customer identity | auth/users | has many Addresses, Orders, ServiceRequests, Reviews | Registered → Verified → Active → Deactivated |
| AdminUser | Staff identity + role | admin | has one Role | Active ↔ Deactivated |
| Role | Named permission set (5 fixed V1 roles) | admin | assigned to AdminUser | Static in V1 |
| Address | Saved shipping address | users | belongs to User | Created → Edited → Deleted |
| Product | Purchasable catalog item | catalog | belongs to Category(ies); has one Inventory record | Draft → Active → Inactive/Discontinued |
| Category | Catalog grouping | categories | has many Products | Active ↔ Hidden |
| Inventory | Stock levels per Product | inventory | belongs to Product; has many InventoryReservations | Continuously updated |
| InventoryReservation | Temporary hold on stock | inventory | belongs to Inventory; belongs to Cart/Order context | Active → Released/Consumed |
| Cart | Pre-purchase selection | cart | belongs to User; has many CartItems | Active → Converted/Abandoned |
| CartItem | Line item in a cart | cart | belongs to Cart, references Product | Created → Removed/Converted |
| Order | Confirmed commerce transaction | orders | belongs to User; has many OrderItems; has one Payment (per attempt sequence), one Shipment | Pending Payment → ... → Completed/Cancelled |
| OrderItem | Line item snapshot on an order | orders | belongs to Order, references Product | Immutable once created |
| Payment | Financial transaction record | payments | belongs to Order or Quote | Pending → Successful/Failed → (Refunded) |
| Refund | Refund against a Payment | payments | belongs to Payment | Initiated → Completed |
| Shipment | Physical delivery record | shipping | belongs to Order or ManufacturingRequest/DesignRequest | Created → ... → Delivered/Returned |
| ManufacturingRequest | Custom production engagement | manufacturing | belongs to User; optionally belongs to Project; has many ProjectFiles, Quotes | Submitted → ... → Completed/Cancelled |
| ConsultationRequest | Consultation engagement | consultation | belongs to User; optionally belongs to Project | Submitted → ... → Completed/Closed |
| DesignRequest | PCB/design engagement | design | belongs to User; optionally belongs to Project; has many ProjectFiles, Quotes | Submitted → ... → Completed/Cancelled |
| SoftwareRequest | Software/firmware engagement | software | belongs to User; optionally belongs to Project; has many ProjectFiles, Quotes | Submitted → ... → Completed/Cancelled |
| Project | Conceptual grouping of related requests | projects | belongs to User; has many *Request records | Open → Closed (informal) |
| ProjectFile | Uploaded or delivered file metadata | files | belongs to exactly one request record; belongs to User (owner) | Pending Scan → Available → (Deleted) |
| Quote | Pricing/scope proposal | quotes | belongs to exactly one request record; has many QuoteVersions | Draft → ... → Approved/Rejected/Expired/Cancelled |
| QuoteVersion | Immutable snapshot of a quote revision | quotes | belongs to Quote | Active (latest) or Superseded |
| QuoteApproval | Approval/rejection event record | quotes | belongs to QuoteVersion | Immutable once created |
| Review | Customer feedback | reviews | belongs to User; belongs to Order or a completed request | Submitted → Visible/Hidden |
| Notification | Record of a sent/attempted email | notifications | belongs to User (recipient); references the triggering entity | Queued → Sent/Failed |
| AuditEvent | Immutable log of a significant action | (cross-cutting, written by core) | references AdminUser or "system"; references affected entity | Immutable |

No `ProductVariant` table is introduced beyond what Document 01 requires ("basic variants... where the product type requires it," Section 7.2) — implemented as a nullable variant-attribute set on `Product` rather than a full variant-matrix system, since V1 does not require configurable products.

---

## 10. Database Relationships

```
User
 │
 ├── Addresses (1:N)
 ├── Cart (1:1 active cart)
 ├── Orders (1:N)
 ├── ManufacturingRequests (1:N)
 ├── ConsultationRequests (1:N)
 ├── DesignRequests (1:N)
 ├── SoftwareRequests (1:N)
 ├── Projects (1:N)
 ├── ProjectFiles (1:N, as owner)
 ├── Reviews (1:N)
 └── Notifications (1:N, as recipient)

Cart
 └── CartItems (1:N) ──references──▶ Product

Product
 ├── Categories (M:N)
 └── Inventory (1:1)
       └── InventoryReservations (1:N)

Order
 ├── OrderItems (1:N) ──snapshot of──▶ Product
 ├── Payment(s) (1:N — one per attempt; at most one Successful)
 ├── Shipment (0:1)
 └── Review(s) (0:N, per OrderItem's Product)

Project (optional grouping)
 ├── ManufacturingRequests (0:N)
 ├── ConsultationRequests (0:N)
 ├── DesignRequests (0:N)
 └── SoftwareRequests (0:N)

ManufacturingRequest / DesignRequest / SoftwareRequest
 ├── ProjectFiles (1:N)
 ├── Quotes (1:N — normally one active lineage)
 │     └── QuoteVersions (1:N)
 │            └── QuoteApprovals (0:N)
 ├── Payment (0:1, linked once Quote is Approved)
 ├── Shipment (0:1, if physical deliverable)
 └── Review (0:1, once Completed)

ConsultationRequest
 ├── (optional) converts into a Quote lineage shared with a spun-off ManufacturingRequest/DesignRequest/SoftwareRequest
 └── Review (0:1, once Completed)

AdminUser
 └── Role (N:1)

AuditEvent ──references──▶ (AdminUser | "system"), (any of the above entities)
```

No SQL DDL is produced here; this is a conceptual relationship model for Document 03/04 to build on.

---

## 11. Database Integrity Rules

- **Primary keys:** UUID primary keys on all business entities (avoids leaking sequential IDs for orders/quotes/requests, and supports safe merge across environments).
- **Foreign keys:** enforced at the database level for every relationship in Section 10; no "soft" application-only foreign keys.
- **Unique constraints:** `User.email` unique; `Category` name unique within a parent; one active `Cart` per `User`; one active (non-superseded) `QuoteVersion` per `Quote`.
- **Indexes:** foreign key columns; `Order.status`, `Quote.status`, `ManufacturingRequest.status` (and equivalents) for admin queue queries; a PostgreSQL full-text/trigram index on `Product.name`/`description` for search (Document 01, Section 27); `Payment.gateway_reference` for webhook lookup.
- **Timestamps:** `created_at`/`updated_at` on every entity; status-specific timestamps where the state model requires them (e.g., `Order.paid_at`, `Quote.approved_at`) rather than reconstructing history solely from AuditEvent for hot-path queries.
- **Soft deletion — used selectively, not universally:** applied to `Product` (Discontinued is a status, not a delete — CAT-001 requires inactive products to remain visible to admins/reporting) and to `Category`. **Not** applied to `Order`, `Payment`, `Quote`, `QuoteVersion`, or `AuditEvent` — these are financial/legal/audit records and must never be deletable at all (hard-blocked at the application layer, not merely soft-deleted). `Address` and `ProjectFile` support hard deletion when the owning customer removes them, since they carry no independent audit requirement beyond what AuditEvent already captures.
- **Status fields:** every stateful entity (Section 22 of Document 01) has an enum-typed status column; transitions are validated in the service layer, not merely constrained by the database enum.
- **Transactional consistency:** any write spanning more than one table that must succeed or fail together (reservation + order creation, quote version creation + supersede, payment confirmation + order status change) is wrapped in a single SQLAlchemy transaction.
- **Concurrency control:** optimistic locking (a `version` integer column) on `Inventory` and `Quote` to detect concurrent modification; row-level locking (`SELECT ... FOR UPDATE`) on `Inventory` during reservation creation/consumption to prevent overselling (Section 12).

---

## 12. Inventory Architecture

```
available_quantity = stock_quantity - reserved_quantity
```

**Reservation creation (checkout entry):**
1. Customer proceeds from Cart to Checkout.
2. For each cart line item, the `InventoryService` acquires a row-level lock (`SELECT ... FOR UPDATE`) on the corresponding `Inventory` row.
3. It verifies `available_quantity >= requested_quantity`. If not, checkout is blocked for that line item (Document 01, Section 24).
4. It creates an `InventoryReservation` record (quantity, expires_at = now + ~15 minutes) and increments `reserved_quantity` on `Inventory`, within the same transaction, then releases the lock.

**Reservation expiry:** a scheduled Celery task (Section 19) runs frequently (e.g., every minute) and finds `InventoryReservation` rows past `expires_at` that are still `ACTIVE`; for each, it locks the corresponding `Inventory` row, decrements `reserved_quantity`, and marks the reservation `RELEASED`, in one transaction per reservation.

**Reservation release (explicit):** triggered immediately if checkout is abandoned via an explicit customer action (e.g., navigating away with a cancel signal) or if payment is confirmed as `Failed` — the same release logic runs immediately rather than waiting for expiry, to free stock sooner when the outcome is already known.

**Purchase confirmation (payment verified):** on verified payment success, `OrderService.confirmOrderOnPayment` locks the `Inventory` row(s), decrements both `reserved_quantity` and `stock_quantity` by the reserved amount, marks the `InventoryReservation` as `CONSUMED`, and creates the `Order`/`OrderItem` records — all in one transaction.

**Cancellation (pre-fulfillment):** if a paid order is cancelled before shipment, stock is conceptually returned via an inventory adjustment recorded by an administrator (Document 01, Section 21 "inventory correction"), not an automatic silent stock reinstatement, since a cancellation after payment may involve a refund decision first.

**Concurrency protection / overselling prevention:** the combination of row-level locking on `Inventory` during reservation creation/consumption, plus the optimistic `version` column as a secondary guard, ensures two simultaneous checkouts for the last unit of stock cannot both succeed (INV-006). The second request's lock wait resolves only after the first transaction commits, at which point `available_quantity` correctly reflects zero and the second request is rejected.

**Why cart never reserves (CART-001):** reservation is deliberately deferred to checkout entry specifically so that stock is not tied up by customers who add items to cart and never proceed — this is an explicit product decision, not a technical shortcut.

---

## 13. Order Architecture

- **Order creation:** occurs exclusively inside `OrderService.confirmOrderOnPayment`, called only after `PaymentService.verifyPayment` (or the webhook handler) confirms a successful, signature-verified payment (ORD-001). No endpoint creates an `Order` directly from checkout submission.
- **Order status:** tracked independently from `Payment.status` (ORD-002); see the state model in Section 22 of Document 01.
- **Order item snapshots:** each `OrderItem` stores a copy of the product name, unit price, and tax rate *at the time of order creation* — never a live reference recalculated from the current `Product` row — so that later catalog price changes cannot retroactively alter a historical order.
- **Price/tax snapshots:** the same snapshot principle applies to the tax breakdown (CGST/SGST/IGST amounts) and the shipping amount charged, all captured on the `Order` at creation time.
- **Final total:** computed once at order creation from the snapshotted line items + tax + shipping, and stored on the `Order` record rather than recalculated on every read.
- **Payment relationship:** an `Order` may have multiple `Payment` attempts (e.g., a failed attempt followed by a successful one) but at most one `Successful` payment.
- **Shipment relationship:** an `Order` has at most one `Shipment` in V1 (no split shipments, per Document 01 Section 6.6 checkout scope).
- **Cancellation:** permitted only while `Order.status` is in a pre-fulfillment state (ORD-003); enforced in `OrderService.cancelOrder` by checking current status before allowing the transition.
- **Refund:** modeled as a `Refund` record against the relevant `Payment`, created by an administrator action (`FINANCE_MANAGER` role); updates `Payment.status` to `Refunded` but does not delete or alter the original `Order`/`Payment` records.

---

## 14. Payment Architecture

```python
class PaymentGateway(Protocol):
    def create_payment_intent(self, amount, currency, reference) -> GatewayIntent: ...
    def verify_payment(self, payment_id, order_id, signature) -> bool: ...
    def verify_webhook_signature(self, payload, signature_header) -> bool: ...
    def initiate_refund(self, gateway_payment_id, amount) -> GatewayRefund: ...

class RazorpayProvider(PaymentGateway):
    ...
```

**Payment creation:** when a customer reaches the payment step (checkout, or an Approved quote), the backend calls `RazorpayProvider.create_payment_intent` to create a Razorpay Order, storing the returned `razorpay_order_id` on VenopAI's own `Payment` record (status `Pending`) before the frontend ever opens the Razorpay checkout widget.

**Payment reference storage:** `Payment` stores `gateway_reference` (Razorpay order/payment IDs) but never raw card/UPI credentials — VenopAI never touches those (SEC-004).

**Signature verification:** on the frontend's post-checkout callback *and* independently on the incoming webhook, the backend calls `RazorpayProvider.verify_payment`/`verify_webhook_signature` using Razorpay's documented HMAC verification. A frontend callback alone, without this server-side verification, is never sufficient (PAY-002).

**Webhook handling:** a dedicated `/api/v1/payments/webhooks/razorpay` endpoint receives Razorpay's server-to-server events, verifies the signature, and — if valid — enqueues a Celery task to process the event (kept out of the request/response cycle so Razorpay's webhook delivery isn't blocked on VenopAI's processing time).

**Captured/failed state:** `Payment.status` moves `Pending → Successful` only after verified confirmation; `Pending → Failed` on a verified failure event or an expired intent.

**Refunds:** `PaymentService.issueRefund` calls `RazorpayProvider.initiate_refund`, then records a `Refund` row and updates `Payment.status` to `Refunded` once Razorpay confirms the refund (not optimistically before confirmation).

**Reconciliation:** a scheduled Celery task (Section 19) periodically compares VenopAI `Payment` records left in `Pending` beyond a threshold against Razorpay's API, catching any missed webhook.

**Idempotency / duplicate webhook protection:** every processed webhook event's Razorpay event ID is recorded; a duplicate event ID is detected and discarded before any state change is attempted (PAY-004). The event-processing Celery task is itself written to be safe to re-run (checking current `Payment.status` before transitioning it) in case of Celery-level retry.

**Retry behavior:** if webhook processing fails transiently (e.g., a DB connectivity blip), the Celery task retries with backoff; Razorpay's own webhook retry (if VenopAI's endpoint responds with a non-2xx) provides an additional outer safety net.

**Payment flow:**
```
Customer clicks "Pay"
       │
       ▼
VenopAI Backend: create local Payment (Pending) + Razorpay Order via RazorpayProvider
       │
       ▼
Frontend opens Razorpay Checkout widget
       │
       ▼
Razorpay processes the payment
       │
       ▼
Razorpay returns result to frontend  ──┐
       │                                │  (both paths converge on the same
       ▼                                │   backend verification logic)
Frontend calls backend "confirm" endpoint
       │                                │
       ▼                                ▼
Backend verifies signature   Razorpay webhook (server-to-server) verified independently
       │                                │
       └───────────────┬────────────────┘
                        ▼
        Idempotent Payment status update (first verified event wins)
                        │
                        ▼
        Order fulfillment (commerce) or execution unlock (service)
```

**Race conditions and handling:** the frontend confirmation call and the async webhook may arrive in either order, or both may arrive. Both paths call the same idempotent `PaymentService.markSuccessful(payment_id, gateway_event_id)` method, which checks `Payment.status` under a row lock before transitioning — whichever arrives first performs the transition; the second is a no-op that still returns success to its caller.

---

## 15. Shipping Architecture

```python
class ShippingProvider(Protocol):
    def check_serviceability(self, pincode) -> ServiceabilityResult: ...
    def get_rate_and_eta(self, origin, destination, weight) -> RateEstimate: ...
    def create_shipment(self, order_or_request_ref, address, items) -> ShipmentRef: ...
    def get_tracking_status(self, shipment_ref) -> TrackingStatus: ...
    def cancel_shipment(self, shipment_ref) -> bool: ...

class ShiprocketProvider(ShippingProvider):
    ...
```

- **Serviceability:** checked at checkout (address entry) via `ShiprocketProvider.check_serviceability`; also re-checked at actual shipment-creation time in case conditions changed (SHIP-004).
- **Rate calculation / ETA:** fetched live from Shiprocket per shipment rather than stored as a static catalog attribute, satisfying SHIP-002 ("calculated estimate, never a guaranteed date").
- **Shipment creation:** `ShippingService.createShipment` is called once an `Order` reaches `Ready to Ship` or a `ManufacturingRequest`/`DesignRequest` reaches `Completed` with a physical deliverable; it stores the returned `ShipmentRef` (AWB/tracking number) on VenopAI's own `Shipment` record.
- **Tracking:** a combination of Shiprocket webhook events (where available) and a scheduled polling task (Section 19) keeps `Shipment.status` current; the customer-facing status always reads from VenopAI's own `Shipment` table, never a live Shiprocket call on every page view.
- **Cancellation:** supported where Shiprocket's API allows it (pre-pickup); otherwise surfaced to the administrator as a manual exception.
- **Delivery updates:** a `Delivered` tracking event triggers the `Order`/request status transition and the corresponding notification (Document 01, Section 17).
- **Webhook/event handling and retry:** mirrors the payment webhook pattern — signature/authenticity check where Shiprocket supports it, idempotent event-ID tracking, Celery-based retry on transient failure.
- **Source of truth:** VenopAI's `Shipment` record remains authoritative for what the customer sees; a Shiprocket outage degrades tracking freshness but never blocks order/request status from reflecting VenopAI's own last-known-good state.

---

## 16. File Storage Architecture

```python
class FileStorageProvider(Protocol):
    def upload(self, file_bytes, filename, folder, access="private") -> StorageRef: ...
    def get_signed_url(self, storage_ref, expires_in) -> str: ...
    def delete(self, storage_ref) -> bool: ...

class CloudinaryProvider(FileStorageProvider):
    ...
```

**Two conceptual categories:**
- **Public media** — product images, category images, marketing assets. Uploaded by administrators via the `catalog`/`categories` modules; served via standard public Cloudinary URLs (no access control needed, matching their public product-listing purpose).
- **Private project files** — PCB/CAD/STEP/STL/DXF files, PDFs, archives, deliverables, invoices. Uploaded via the `files` module; stored in Cloudinary under access-restricted delivery settings; never served via a guessable public URL.

**Metadata vs. storage split:** PostgreSQL's `ProjectFile` table stores owner, associated request ID, original filename, MIME type, size, scan status, and the Cloudinary `storage_ref` — Cloudinary stores only the bytes. No business logic ever trusts Cloudinary as the answer to "who can see this file"; that answer always comes from `ProjectFile` + the requesting user's identity.

**Access control:** every download request goes through `FileService.getDownloadURL(file_id, requesting_user)`, which checks that the requesting user is either the owning customer or an administrator whose role covers that request type (Document 01, FILE-001/004), and only then calls `CloudinaryProvider.get_signed_url` with a short expiry — the backend never returns a raw, permanent Cloudinary URL for a private file.

**Upload validation:** enforced before a file is accepted — allowed MIME types (image, PDF, common CAD formats, ZIP) and a maximum file size (proposed default 100MB per file, per Document 01 Section 34 open question, to be finalized here as the V1 default pending business confirmation).

**MIME validation:** checked both by declared content-type and by inspecting file signature bytes server-side (not trusting the client-declared type alone).

**Malware scanning:** every uploaded private file is created in PostgreSQL with `scan_status = PENDING_SCAN` and is not made available for download until a Celery task runs it through a malware-scanning step and marks it `CLEAN` (FILE-003); a `FLAGGED` result blocks the file and notifies the uploading customer.

**File lifecycle:** `PENDING_SCAN → CLEAN → (available indefinitely)`, or `PENDING_SCAN → FLAGGED → (blocked, customer notified)`. Deletion is customer-initiated (hard delete of the metadata row and a corresponding Cloudinary delete call) or administrator-initiated for moderation reasons.

**Versioning/replacement:** V1 does not require in-place file versioning (this is distinct from Quote versioning); a "revised" file upload is stored as a new `ProjectFile` row associated with the same request, and the prior file remains available unless the customer deletes it — this keeps the file model simple and avoids inventing a feature Document 01 does not require.

---

## 17. Email Architecture

```python
class EmailProvider(Protocol):
    def send(self, to, template_id, context) -> SendResult: ...

class ResendProvider(EmailProvider):
    ...
```

- **Email service abstraction:** the `notifications` module exposes a single `NotificationService.notify(event, user, context)` call to every other module; it resolves the correct template and calls `EmailProvider.send` — no module calls Resend directly.
- **Templates:** one template per event listed in Document 01 Section 17 (account verification, password reset, order confirmation, payment confirmation/failure, quote issued/revised/approved/rejected, manufacturing/design/software/consultation status updates, shipment created/tracking/delivery).
- **Transactional emails only:** V1 sends no marketing/bulk email; every send is tied to a specific business event (NOTIF-002).
- **Delivery failure:** a failed send is recorded on the `Notification` row as `Failed` with the provider's error reason; visible to administrators (Document 01, Section 20, "Notifications: view send history/failures").
- **Retry:** transient Resend failures are retried by the Celery task with backoff (a small, bounded number of attempts) before being marked `Failed` for good.
- **Idempotency:** each `Notification` row is created before the send attempt with a unique key derived from (event type, entity ID, recipient); a duplicate trigger for the same event does not send a second email.
- **Background sending:** every notification send happens in a Celery task, never synchronously inside the request that triggered it, so a slow/unavailable Resend call never delays the customer-facing action that triggered the notification.
- **No SMS/WhatsApp:** confirmed as a hard V1 exclusion; no code path or provider abstraction exists for other channels.

---

## 18. Background Job Architecture

Celery (with Redis/Upstash as broker and result backend) handles all work that must be durable, retryable, or survive a process restart. Operations that belong in Celery:

- Email sending (Section 17)
- File malware scanning (Section 16)
- Webhook event processing (payment and shipping — Sections 14, 15)
- Notification dispatch generally
- Shipment tracking synchronization (polling fallback where webhooks are unavailable)
- Cleanup of expired inventory reservations (Section 12, Section 19)
- Quote expiry processing (Section 19)
- Periodic payment reconciliation (Section 14)
- Any other durable asynchronous operation identified during Document 04's detailed design, provided it satisfies "must survive a restart / needs retries / not required in-request"

**Why FastAPI `BackgroundTasks` is not a substitute for Celery here:** `BackgroundTasks` runs in-process, tied to the life of the web worker that handled the request — if that worker restarts or crashes (a deploy, an autoscale event, a crash) before the task finishes, the task is silently lost with no retry and no record. None of the operations above are acceptable to lose silently (a missed reservation-expiry sweep can cause overselling window issues; a missed webhook-processing retry can leave a payment stuck as Pending). Celery tasks are persisted in the broker until acknowledged, support automatic retry with backoff, and run in dedicated worker processes independent of the web process's lifecycle. `BackgroundTasks` is acceptable only for genuinely fire-and-forget, loss-tolerant work — VenopAI V1 does not currently have a case that qualifies, so all async work above goes through Celery.

---

## 19. Scheduled Jobs

Using Celery Beat, the following periodic tasks are required — no more, no fewer than what Document 01's business rules demand:

| Job | Frequency | Purpose |
|---|---|---|
| Expire inventory reservations | Every 1 minute | Release `InventoryReservation` rows past `expires_at` (Section 12) |
| Expire quotes | Every 15–30 minutes | Move `Quote`/`QuoteVersion` rows past their validity period to `Expired` (QUOTE-002) |
| Payment reconciliation | Every 15–30 minutes | Compare long-`Pending` `Payment` rows against Razorpay's API to catch missed webhooks |
| Shipment tracking sync | Every 30–60 minutes | Poll Shiprocket for status on active shipments not recently updated via webhook |
| Notification retry sweep | Every 5–10 minutes | Retry `Failed` notifications that are eligible for another attempt |
| Consultation inactivity check | Daily | Flag/auto-close consultations past the inactivity threshold (Document 01, Section 34 open question — default proposed there) |

No additional scheduled jobs (e.g., speculative analytics pre-computation, cache warming) are introduced without a driving requirement.

---

## 20. Authentication Architecture

- **Registration:** email + password; password hashed with a strong adaptive algorithm (bcrypt or argon2) — plaintext passwords are never stored or logged.
- **Email verification:** a single-use, time-limited verification token (opaque, stored hashed) is emailed on registration; `User.status` moves `Registered → Verified` only when a valid, unexpired token is presented (AUTH-001).
- **Login:** validates credentials, issues an **access token** (JWT, short-lived, e.g., 15 minutes) and a **refresh token** (long-lived, e.g., 7–30 days).
- **Token storage strategy:** the access token is returned in the response body for the frontend to hold in memory; the refresh token is set as an **HTTP-only, Secure, SameSite=Strict cookie** — never exposed to client-side JavaScript, reducing XSS exfiltration risk.
- **Refresh/rotation:** each use of the refresh token issues a new access token *and* a new refresh token (rotation), invalidating the previous refresh token; this limits the damage window if a refresh token is ever compromised.
- **Revocation:** refresh tokens are tracked server-side (a `RefreshToken` table with a revoked flag) so logout, password change, or an administrator-initiated account deactivation can immediately invalidate all outstanding sessions for a user.
- **Password reset:** a single-use, time-limited reset token (opaque, stored hashed, short expiry e.g. 30–60 minutes) emailed on request (AUTH-002); presenting a valid token allows setting a new password, which also revokes all existing refresh tokens for that account.
- **CSRF considerations:** because the refresh token lives in an HTTP-only cookie, the refresh endpoint is protected against CSRF via a `SameSite=Strict` cookie policy plus a double-submit CSRF token header checked on the refresh call itself; the access token (used for all other authenticated calls) is sent via an `Authorization: Bearer` header, which is not subject to CSRF since it's not automatically attached by the browser.
- **Admin authentication:** uses the same JWT mechanism with a distinct token audience/claim (`is_admin` + `role`), issued only through a separate admin login flow — an admin credential can never be used to mint a customer-scoped token or vice versa.

No additional authentication complexity (OAuth/social login, MFA) is introduced in V1, per Document 01's scope.

---

## 21. Authorization / RBAC

**Model:** Role → Permission(s) → Resource + Action.

| Role | Example Permissions (Resource : Action) |
|---|---|
| SUPER_ADMIN | `*:*` (all resources, all actions) |
| MANUFACTURING_MANAGER | `manufacturing:*`, `design:*`, `software:*`, `quotes:*`, `files:read/write (own-domain requests)` |
| ORDER_MANAGER | `orders:read/write`, `inventory:read/write`, `shipments:read/write`, `catalog:read`, `categories:read` |
| SUPPORT_EXECUTIVE | `customers:read/limited-write`, `orders:read`, `service-requests:read`, `reviews:moderate` |
| FINANCE_MANAGER | `payments:read/write`, `refunds:write`, `invoices:read`, `analytics:financial:read` |

**Enforcement points:**
- **API layer:** every admin-facing router endpoint is decorated with a permission requirement (e.g., `require_permission("manufacturing:write")`), checked against the authenticated admin's role before the service layer is ever invoked.
- **Service/business layer:** for actions with additional contextual rules beyond a flat permission check (e.g., a `SUPPORT_EXECUTIVE` may read a service request but never alter its quote), the service layer re-validates role-appropriate scope, not just "is authenticated as some admin."
- **Admin UI enforcement:** the Next.js admin console hides controls the current role cannot use, purely as a UX convenience — this is explicitly **not** treated as a security boundary (Section 22).
- **Database/query filtering:** customer-facing queries are always scoped to `WHERE user_id = :current_user_id` at the repository layer (ACCT-001); there is no endpoint that returns another customer's data by manipulating an ID parameter, because the repository layer enforces the ownership filter regardless of what ID is requested.

**Critical rule (restated):** a hidden button in the frontend is never the enforcement mechanism. Every state-changing action is re-checked at the API layer regardless of what the UI does or doesn't show.

---

## 22. Security Architecture

- **TLS:** enforced everywhere via Cloudflare (edge) and Render/Vercel (origin); no plaintext HTTP endpoint is exposed.
- **Password hashing:** bcrypt or argon2, with a sufficient work factor; never reversible, never logged.
- **JWT security:** signed with a strong secret (or asymmetric key) held in the platform's secret manager, never in source control; short access-token lifetime limits exposure if leaked.
- **Refresh-token security:** HTTP-only, Secure, SameSite=Strict cookie; rotated on every use; revocable server-side (Section 20).
- **Rate limiting:** applied at minimum to authentication endpoints (login, password reset, registration) and payment-initiation endpoints, using Redis-backed counters, to blunt credential-stuffing and abuse.
- **Input validation:** every request body validated by Pydantic schemas; no raw, unvalidated payload reaches a service.
- **Output validation:** response schemas explicitly enumerate returned fields (Pydantic response models) so internal-only fields are never accidentally serialized to the client.
- **SQL injection protection:** exclusively parameterized queries via SQLAlchemy; no raw string-interpolated SQL.
- **CSRF:** addressed per Section 20 for the cookie-based refresh flow; not otherwise relevant since primary API auth uses bearer tokens.
- **CORS:** restricted to the known frontend origin(s) (Vercel production/preview domains, local dev); no wildcard origin in production.
- **Secure headers:** standard hardening headers (HSTS, X-Content-Type-Options, X-Frame-Options/CSP) set on backend responses and via Vercel/Cloudflare on the frontend.
- **Secrets management:** all provider API keys (Razorpay, Shiprocket, Cloudinary, Resend, database credentials, JWT signing key) are stored in Render/Vercel's environment/secret configuration, never committed to the repository.
- **Webhook signature verification:** mandatory for both Razorpay and Shiprocket webhook endpoints before any processing occurs (Sections 14, 15).
- **File security:** private-by-default access, malware scanning, signed short-lived URLs (Section 16).
- **RBAC:** as defined in Section 21.
- **Audit logging:** every state-changing admin action and every significant automated state transition writes an `AuditEvent` (AUDIT-001/002).
- **Dependency security:** GitHub Actions CI includes automated dependency vulnerability scanning (e.g., `pip-audit`/`npm audit` equivalents) as a build-gate check.
- **Security event logging:** repeated failed login attempts, failed webhook signature checks, and authorization denials are logged (and, at volume, surfaced to Sentry) for operational visibility — without inventing a dedicated SIEM, which is out of scope for V1.

No compliance certification (SOC 2, ISO 27001, PCI-DSS scope beyond "never touch card data directly") is claimed or implied; VenopAI's PCI exposure is minimized specifically by never handling raw card/UPI details, which Razorpay's hosted checkout flow already ensures.

---

## 23. Data Privacy

- **Customer identity (name, email, phone):** access-restricted to the owning customer and role-appropriate administrators (SEC-008); never exposed in any public-facing API response.
- **Address:** same restriction as identity; used server-side for shipping-provider calls without being logged in plaintext application logs beyond what's operationally necessary.
- **Payment references:** VenopAI stores only Razorpay's own reference IDs, never card/UPI numbers (SEC-004) — there is nothing sensitive here to encrypt beyond standard database access control, since the sensitive payment instrument data never enters VenopAI's systems at all.
- **Project files / engineering IP:** treated as the most sensitive customer data in the platform; private-by-default, access-controlled, malware-scanned (Section 16); Cloudinary's private-delivery mode plus VenopAI's own access-check layer (SEC-009).
- **Invoices:** access-restricted identically to project files (SEC-009).
- **Admin activity:** captured via AuditEvent, itself access-restricted to `SUPER_ADMIN` (and relevant role for their own actions), not exposed to customers.
- **Encryption at rest:** relied upon at the infrastructure level (managed PostgreSQL's at-rest encryption, Cloudinary's storage encryption) rather than re-implemented in the application; **no additional column-level application encryption** is applied to searchable fields (e.g., email, name) since doing so would break the indexing/search capability Document 01 requires (Section 27) without a demonstrated requirement justifying that trade-off.
- **TLS in transit:** covers all data movement between the frontend, backend, database, and external providers (Section 22).
- **Access control as the primary protection:** for VenopAI V1, the dominant privacy control is *who can query what* (RBAC + ownership filtering), not field-level cryptography — this matches the actual risk profile (accidental cross-customer data exposure via a missing `WHERE` clause) more directly than encryption would.

---

## 24. API Architecture

- **Versioning:** all endpoints are namespaced under `/api/v1/`; a future breaking change would introduce `/api/v2/` rather than mutating v1's contract.
- **Authentication:** `Authorization: Bearer <access_token>` on every authenticated endpoint; the refresh flow alone uses the HTTP-only cookie (Section 20).
- **Authorization:** enforced per Section 21 before any service logic executes.
- **Request validation:** Pydantic request models; malformed/invalid requests are rejected before reaching a service.
- **Response models:** explicit Pydantic response schemas per endpoint (Section 22, output validation).
- **Pagination:** cursor- or offset-based pagination (finalized in Document 04) applied consistently to every list endpoint (products, orders, requests, quotes, files, reviews, notifications).
- **Filtering/sorting:** query-parameter-based, consistent naming conventions across modules (e.g., `?status=`, `?sort=`).
- **Error model:** a single consistent envelope (Section 25) returned for every error case across every module.
- **Idempotency:** state-changing endpoints that are safe to retry (e.g., payment confirmation callbacks) support an idempotency key or are naturally idempotent by design (Section 26).
- **Correlation/request IDs:** every request is assigned a request ID (generated at the edge or by FastAPI middleware), propagated into logs and included in error responses, so a customer-reported issue can be traced through logs and Sentry.

The complete endpoint catalog (exact paths, request/response JSON shapes) is intentionally deferred to Document 04, per the document-boundary rule in Document 01.

---

## 25. Error Handling

**Conceptual error categories:**

| Category | HTTP Class | Example |
|---|---|---|
| Validation error | 4xx | Malformed request body |
| Authentication error | 401 | Missing/expired/invalid token |
| Authorization error | 403 | Valid identity, insufficient permission |
| Not found | 404 | Requested entity doesn't exist or isn't owned by the caller |
| Conflict | 409 | Concurrent modification (e.g., quote already superseded) |
| Business rule violation | 422 (or 409) | e.g., attempting to pay an unapproved quote |
| External provider failure | 502/503 | Razorpay/Shiprocket/Cloudinary/Resend unavailable |
| Rate limit | 429 | Too many requests from a client |
| Internal server error | 500 | Unhandled exception |

**Consistent error structure (conceptual envelope):**
```json
{
  "error": {
    "code": "QUOTE_NOT_APPROVED",
    "message": "This quote must be approved before payment can be initiated.",
    "request_id": "..."
  }
}
```

- **Safe user-facing messages:** business-rule and validation errors return a clear, actionable message; internal/unexpected errors return a generic message ("Something went wrong, please try again") without leaking stack traces or internal details.
- **Internal logging:** every 5xx (and any unexpected 4xx pattern) is logged with full context server-side and reported to Sentry, independent of what the client sees.
- **Correlation IDs:** included in every error response so a customer support ticket referencing it can be traced directly to the corresponding log/Sentry entry.
- **Provider error normalization:** integration modules translate provider-specific errors (a Razorpay error code, a Shiprocket error payload) into VenopAI's own conceptual error categories before they reach a router, so callers never need to understand a third party's error format.

---

## 26. Idempotency

Idempotency is required wherever an operation might be triggered more than once for the same logical event — primarily webhooks and payment confirmation, but the principle is applied consistently:

- **Payment webhook processing (Section 14):** each Razorpay event carries a unique event ID; VenopAI records processed event IDs and skips reprocessing a duplicate (PAY-004).
- **Payment confirmation (frontend callback vs. webhook race):** both paths converge on the same guarded state-transition method, keyed by the payment's current status under a row lock — whichever arrives first wins, the second is a safe no-op (Section 14).
- **Shipping webhook/tracking events:** similarly deduplicated by provider event ID before any `Shipment` status change is applied.
- **Order creation:** guarded so that a given successful `Payment` can trigger `Order` creation exactly once — the service checks for an existing `Order` linked to that `Payment` before creating a new one.
- **Notification sending:** deduplicated by a unique key of (event type, entity ID, recipient) so a retried trigger doesn't send a duplicate email (Section 17).
- **Quote versioning:** creating a new version and superseding the old one is a single transaction, so a retried "revise quote" request due to a client-side timeout cannot produce two new versions or leave the quote in an inconsistent state — the service checks whether a pending revision already exists for that quote before creating another.
- **Client-side retries generally:** any endpoint that a frontend might reasonably retry after a timeout (without knowing if the first attempt succeeded) is designed to be safe to call twice with the same input, either by being naturally idempotent (e.g., "get current status") or by accepting an idempotency key that the backend uses to recognize a repeat submission (reserved for Document 04 to specify per-endpoint).

This section closes the required structure of Document 02 as scoped from the provided instructions; Sections 27 onward (concurrency & transactions detail, caching strategy, observability, testing strategy, environments & CI/CD, deployment topology, scalability posture, backup & disaster recovery, cost considerations, technical scope matrix, technical exclusions, open questions, and the final technical contract) are provided below to complete a coherent, implementation-ready architecture document consistent with the same depth and rigor as Document 01.

---

## 27. Concurrency & Transaction Management

- **Explicit transaction boundaries:** every service method that writes to more than one table demarcates an explicit `with session.begin():` block; there is no reliance on autocommit for multi-table writes.
- **Row-level locking:** used specifically for `Inventory` (reservation creation/consumption, Section 12) and `Quote`/`QuoteVersion` (revision/supersede, Section 11 of Document 01) — the two places where a lost update would directly cause a business-rule violation (overselling, or two conflicting quote revisions).
- **Optimistic locking:** a `version` column on `Inventory` and `Quote` provides a secondary guard and clear conflict signaling (409 Conflict) for the admin UI when two administrators edit the same quote concurrently.
- **Isolation level:** PostgreSQL's default `READ COMMITTED` is used for general reads; the specific locking transactions above (`SELECT ... FOR UPDATE`) provide the additional guarantee needed for the inventory and quote invariants without requiring a stricter global isolation level (e.g., `SERIALIZABLE`), which would add contention cost without a demonstrated need elsewhere.
- **Deadlock avoidance:** lock acquisition order is standardized (e.g., always lock `Inventory` rows in a consistent order — by product ID — when a checkout touches multiple line items) to avoid circular wait conditions.

---

## 28. Caching Strategy

Caching is applied only where Document 01 creates a clear read-heavy pattern, not speculatively:

- **Product catalog reads:** category lists and individual product detail pages are cached in Redis with a short TTL (e.g., 60 seconds) and explicit invalidation on admin update, since these are read far more often than written.
- **Search results:** not cached in V1 — PostgreSQL's own query performance is expected to be sufficient at V1 scale (Document 01, Section 27); revisit only if load testing shows otherwise.
- **Session/token data:** refresh-token revocation lookups are Redis-backed for low-latency checks on every authenticated request.
- **Rate limiting counters:** stored in Redis (Section 22).
- **What is never cached:** inventory availability, quote status, payment status, order status — any state where staleness could cause an incorrect business decision (e.g., showing stock as available when a reservation just consumed it) is always read live from PostgreSQL.

---

## 29. Observability & Monitoring

- **Error tracking:** Sentry captures unhandled exceptions and explicitly reported errors from both the FastAPI backend and the Next.js frontend, tagged with the request/correlation ID (Section 24) for cross-referencing.
- **Structured logging:** the backend emits structured (JSON) logs including request ID, user/admin ID (where applicable), module, and outcome, suitable for search in Render's log aggregation without standing up a dedicated log platform in V1.
- **Health checks:** a lightweight `/health` endpoint (database connectivity, Redis connectivity) is exposed for Render's own health-check mechanism.
- **Business-event visibility:** the Audit History (Document 01, Section 23) and the Analytics module (Section 28 of Document 01) serve as the business-level observability layer — this document does not introduce a separate metrics/dashboard platform (e.g., Prometheus/Grafana) beyond what Sentry and Render provide, since V1 scale does not demonstrate a need for it.
- **Alerting:** Sentry's own alerting (error-rate thresholds) is the V1 alerting mechanism; no dedicated on-call/paging platform is introduced.

---

## 30. Testing Strategy

- **Unit tests:** cover service-layer business rules in isolation (e.g., "a quote cannot be approved twice," "a reservation cannot exceed available stock") using an in-memory or test-database fixture, per module.
- **Integration tests:** exercise the full router → service → repository → test-database path for each module's key endpoints, including authentication/authorization enforcement.
- **Contract tests for external providers:** Razorpay, Shiprocket, Cloudinary, and Resend integrations are tested against recorded/mocked responses (not live sandbox calls in CI) to keep CI fast and deterministic, with a smaller set of manual/staging-environment tests against actual sandbox credentials before release.
- **Idempotency tests:** explicit test cases simulating duplicate webhook delivery and race conditions between the frontend-confirmation and webhook paths (Section 26).
- **Concurrency tests:** explicit test cases simulating two simultaneous checkout attempts for the last unit of stock, verifying only one succeeds (Section 12).
- **CI gate:** GitHub Actions runs the full test suite, linting, and dependency vulnerability scanning (Section 22) on every pull request; merges to the deploy branch are blocked on a green build.

---

## 31. Environments & CI/CD

- **Environments:** `development` (local), `staging` (Render/Vercel preview, connected to sandbox Razorpay/Shiprocket/Cloudinary/Resend credentials), `production`.
- **Branching:** feature branches → pull request (CI runs, Section 30) → merge to `main` → automatic deploy to `staging` → manual promotion to `production` after verification.
- **Configuration:** environment-specific settings (database URL, Redis URL, provider API keys) are injected via Render/Vercel environment variables per environment; no environment-specific values are hardcoded or committed.
- **Database migrations:** Alembic migrations run as an explicit deploy step before the new application version starts serving traffic, ensuring schema and code stay in lockstep.
- **Rollback:** Render's deployment history allows rolling back to a prior build; a corresponding Alembic downgrade path is maintained for schema changes where feasible, with the understanding that some migrations (e.g., destructive column drops) are deliberately deployed in a backward-compatible two-step pattern to keep rollback safe.

---

## 32. Deployment Topology & Scalability Posture

- **Frontend:** Vercel's standard Next.js deployment (edge-cached static assets, serverless functions for any server-side rendering needs).
- **Backend:** Render web service(s) running the FastAPI application (horizontally scalable by adding Render instances behind its built-in load balancing, if/when load requires it) plus a separate Render worker service running Celery workers, plus Celery Beat for scheduled jobs (Section 19) as its own small service or a leader-elected mode within the worker service.
- **Database:** a single managed PostgreSQL instance for V1, sized for early-stage load, with the option to scale vertically (larger instance) before any horizontal/read-replica complexity is introduced.
- **Redis:** a single Upstash Redis instance serving both caching and Celery broker duties in V1 — separated into distinct instances only if contention between the two use cases is actually observed.
- **Scalability posture:** V1 scales vertically and via Render's simple horizontal instance scaling for the web tier; no auto-scaling policy tuning, multi-region deployment, or database sharding is part of V1 — these are explicitly deferred (matching Document 01's V1 exclusions) until real usage data justifies them.

---

## 33. Backup & Disaster Recovery

- **Database backups:** automated daily backups via the managed PostgreSQL provider, with point-in-time recovery enabled where the provider tier supports it.
- **File storage durability:** relied upon at Cloudinary's own durability guarantees; VenopAI does not maintain a separate copy of uploaded files.
- **Recovery expectation:** a V1-appropriate recovery point objective (RPO) of "up to 24 hours" (daily backup cadence) and a recovery time objective (RTO) measured in hours, not minutes — consistent with an early-stage, budget-conscious platform; formal RPO/RTO SLAs are not committed to customers in V1.
- **Configuration/secrets backup:** environment variable configuration is documented and version-controlled (values excluded, structure included) so an environment can be reconstructed on a new Render/Vercel project if needed.

---

## 34. Cost Considerations

- Every provider chosen (Render, Vercel, Upstash, managed PostgreSQL, Cloudinary, Resend, Razorpay, Shiprocket, Sentry, Cloudflare) has a usable free or low-cost starting tier appropriate for an early customer base, consistent with Document 01's "budget-conscious" V1 principle.
- No component in this architecture requires a minimum-spend enterprise contract to operate at V1 scale.
- Cost growth is expected to track usage roughly linearly (database size, Cloudinary storage/bandwidth, email volume, Redis usage) rather than requiring a step-function infrastructure investment before the business has validated demand.

---

## 35. Technical Scope Matrix

| Area | V1 | Later | Notes |
|---|---|---|---|
| Modular monolith (FastAPI) | Yes | Selective service extraction | Only if a specific module's load genuinely demands it |
| PostgreSQL full-text/trigram search | Yes | Elasticsearch | Matches Document 01 exclusion |
| JWT auth (access + rotating refresh) | Yes | MFA, social login | Matches Document 01 scope |
| Celery + Redis background jobs | Yes | Additional broker/queue tooling | Not needed at V1 scale |
| Razorpay-only payments | Yes | Additional gateways | Matches PAY-001 |
| Shiprocket-only shipping | Yes | Additional aggregators | Matches SHIP-001 |
| Cloudinary file storage | Yes | Self-hosted object storage | Not justified at V1 scale/cost |
| Resend email-only notifications | Yes | SMS/WhatsApp | Matches NOTIF-001 |
| Sentry error monitoring | Yes | Full APM/metrics platform | Not justified at V1 scale |
| Single-region deployment (Render/Vercel) | Yes | Multi-region | Matches Document 01 exclusion |
| Horizontal instance scaling (simple) | Yes | Kubernetes/auto-scaling policies | Not justified at V1 scale |
| Row-level locking for inventory/quotes | Yes | — | Required by INV-006/QUOTE-003 |
| Application-level field encryption beyond provider defaults | No | Possible future, if a specific field's risk profile changes | Not justified today (Section 23) |

---

## 36. Technical Exclusions (Restated from Document 01, with Technical Rationale)

- **Microservices / Kubernetes / service mesh** — a modular monolith fully satisfies every module boundary in Document 01 without the operational overhead of distributed deployment, service discovery, and network-boundary failure modes that a small team would need to absorb for no corresponding V1 benefit.
- **Kafka / event-driven distributed architecture** — Celery + Redis fully covers V1's async/durable-job needs; introducing a distributed event bus would add operational surface area without a use case that requires event streaming or multi-consumer fan-out at V1 scale.
- **Elasticsearch** — PostgreSQL's native text-search/trigram capability is sufficient for V1 catalog size and query patterns.
- **Multiple payment/shipping providers** — a provider-abstraction interface (Sections 14, 15) already makes adding a second provider a contained change later; building for multiple providers today would mean building and testing failover/routing logic for a scenario that doesn't yet exist.
- **Multi-region infrastructure** — single-region Render/Vercel deployment is appropriate for VenopAI's initial (India-focused, per Document 01's domestic-only shipping/addresses scope) customer base.
- **SMS/WhatsApp notification infrastructure** — no code path, provider credential, or template exists for these; adding them later is a new module addition, not a rework of the `notifications` abstraction, which is already channel-agnostic at the interface level (`EmailProvider` today, extendable to a general `NotificationChannel` protocol later without disrupting callers).

---

## 37. Open Questions / Technical Decisions Requiring Confirmation

| Question | Why It Matters | Proposed Default | Decision Required? |
|---|---|---|---|
| Exact access-token and refresh-token lifetimes | Affects session UX and security exposure window | Access: 15 minutes; Refresh: 14 days, rotating | Yes |
| Maximum file upload size and per-request storage quota | Affects Cloudinary cost and upload UX | 100MB per file (as proposed in Document 01, Section 34); no explicit per-request aggregate cap in V1 | Yes |
| Whether admin console is a separate Next.js app or a protected section of the customer-facing app | Affects deployment topology and RBAC UI boundary | Single Next.js codebase with a route-group-based admin section, sharing the same backend | Yes |
| Malware-scanning provider/mechanism for uploaded files | Affects Section 16 implementation and cost | Use a managed scanning API/service integrated into the Celery scan task (specific vendor to be selected during Document 04/implementation) | Yes |
| Whether `Project` is persisted as its own table now or added later | Affects Section 9 schema timing | Persist a lightweight `Project` table now (low cost, avoids a later migration to retrofit grouping) | Yes |
| Rate-limit thresholds for auth/payment endpoints | Affects abuse resistance vs. legitimate-user friction | Conservative default (e.g., 10 attempts/hour per IP+account for login) tunable via configuration | Yes |

---

## 38. Traceability

```
Product Requirement (Document 01)
   ↓
Technical Requirement & Architecture (this document)
   — Section 8 maps every Document 01 module to a backend module
   — Section 9/10 maps every Document 01 data entity (Section 26) to a database entity
   — Section 23 maps every Document 01 business rule (Section 23) to an enforcing architectural mechanism
   ↓
UI/UX & Screen Specification (Document 03)
   — realizes the customer journeys (Document 01, Section 9) and admin workflows (Document 01, Section 21) as concrete screens, using this document's module boundaries to determine screen-to-backend mapping
   ↓
API Contract Specification (Document 04)
   — realizes Section 24 (API architecture) and Section 26 (idempotency) as concrete endpoint definitions, request/response schemas, and status codes
   ↓
Acceptance Test (Document 01, Section 32)
```

Example trace: `INV-003 (~15-minute reservation) → Section 12 (Inventory Architecture: reservation record + expires_at) → Section 19 (scheduled expiry job) → Document 04: reservation status visible in checkout-session endpoint response → Acceptance test: "a reservation created at checkout and not completed within 15 minutes releases the held stock."`

---

## 39. Final V1 Technical Contract

**VenopAI V1 Technical Architecture Contract**

VenopAI V1 is built as a **modular monolith**: one Next.js/TypeScript frontend on Vercel, one FastAPI/Python backend on Render, organized internally into domain modules that mirror Document 01's product modules exactly, with no cross-module logic leakage and no microservice extraction in V1.

**Data:** PostgreSQL is the single, authoritative transactional store for every business entity; no external provider is ever treated as a source of truth for VenopAI's own order, payment, quote, or shipment state.

**Async work:** Celery + Redis (Upstash) handle every operation that must be durable, retryable, or independent of the web request lifecycle — reservation expiry, quote expiry, webhook processing, email sending, shipment sync, reconciliation — with FastAPI `BackgroundTasks` deliberately unused for any of these.

**External integrations:** Razorpay (payments), Shiprocket (shipping), Cloudinary (files), and Resend (email) are each accessed exclusively through a narrow provider-abstraction interface, so no business logic is coupled to a specific vendor's API shape.

**Core invariants enforced architecturally:** no overselling (row-level-locked reservations), no payment before quote approval (service-layer guard checked against `Quote.status`), no silent quote modification (immutable versioning with supersede semantics), no order created without server-verified payment (idempotent, webhook-and-callback-converging confirmation), no cross-customer data access (repository-level ownership filtering), no public exposure of private project files (signed, short-lived, access-checked URLs only).

**Security posture:** JWT access + rotating HTTP-only-cookie refresh tokens, role-scoped RBAC enforced at the API layer (never the UI alone), webhook signature verification on every external event, private-by-default files with mandatory malware scanning, and centralized audit logging of every state-changing administrative action.

**Infrastructure posture:** entirely managed, single-region, budget-conscious services (Render, Vercel, Upstash, managed PostgreSQL, Cloudinary, Resend, Sentry, Cloudflare) — no Kubernetes, no service mesh, no Kafka, no multi-region deployment, no additional payment/shipping providers, no Elasticsearch, in V1.

**Architectural independence:** this document defines *how* VenopAI is technically built to satisfy every requirement in Document 01. It introduces no new product capability, no new business rule, and no scope beyond what Document 01 authorizes. Documents 03 (UI/UX) and 04 (API contracts) must be built to conform to the module boundaries, data model, and architectural principles established here.

**This document is the authoritative V1 technical architecture contract for VenopAI.**
