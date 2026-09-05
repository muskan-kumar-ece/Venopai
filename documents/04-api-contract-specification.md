# 04 — API Contract Specification

## VenopAI V1 API Contract Specification

---

## 1. Document Control

| Field | Value |
|---|---|
| Document Title | VenopAI V1 API Contract Specification |
| Document ID | VNP-DOC-04 |
| Version | 1.0 |
| Status | Approved — authoritative implementation contract |
| Authority | Sole authoritative source for VenopAI's API surface: endpoints, schemas, states, errors, and RBAC for V1 |
| Purpose | Define the formal, implementation-grade contract between the VenopAI frontend, admin frontend, backend, and external integrations, fully derived from Documents 01–03 without inventing new product behavior |
| Intended Audience | Backend engineers (FastAPI), frontend engineers, admin frontend engineers, QA engineers, integration developers, AI coding agents |
| Source Documents | `01-core-product-requirements.md` (VNP-DOC-01), `02-technical-requirements-and-architecture.md` (VNP-DOC-02), `03-ui-ux-and-screen-specification.md` (VNP-DOC-03) |
| Relationship to Documents 01–03 | This document is the concrete API realization of Doc 01's product rules, Doc 02's architecture, and Doc 03's screens/actions. It introduces no product capability, business rule, or screen not already established by those three documents |
| Precedence Rules | Where this document conflicts with Doc 01 on business rules, Doc 01 prevails. Where it conflicts with Doc 02 on technical structure, Doc 02 prevails. Where it conflicts with Doc 03 on what a screen needs, this document must be corrected to serve that need. Internal conflicts resolve toward the most specific section (a named endpoint spec beats a general convention) |
| Change-Control Rules | Adding a genuinely new endpoint requires a traceable requirement in Doc 01–03; it cannot be introduced here alone. Backward-incompatible changes to an existing V1 endpoint follow the versioning/deprecation rules in Section 75 |

---

## 2. API Executive Summary

The VenopAI API is a single versioned REST contract (`/api/v1/`) served by the FastAPI modular monolith (Document 02, Section 6), consumed by three clients: the **customer-facing Next.js application**, the **admin Next.js application** (a distinct route-group/shell per Document 03, Section 36, sharing this same backend), and, indirectly, **external providers** delivering webhooks (Razorpay, Shiprocket).

- **Authentication:** JWT-based — a short-lived bearer access token for all authenticated calls, a rotating HTTP-only-cookie refresh token for session renewal (Document 02, Section 20).
- **Versioning:** all endpoints live under `/api/v1/`; no `/v2` exists or is implied until a genuine breaking change is required (Section 75).
- **Domain organization:** endpoints are grouped by business domain (auth, users, products, categories, search, cart, checkout, addresses, inventory, orders, payments, shipping, manufacturing, design, consultations, software, projects, files, quotes, reviews, notifications, admin), mirroring Document 02's module boundaries one-to-one — no endpoint spans multiple modules' data ownership.
- **External integrations:** Razorpay (payments), Shiprocket (shipping), Cloudinary (files), Resend (email) are never exposed directly to any client — every interaction is mediated and normalized by the backend (Section 62).
- **Webhooks:** Razorpay and Shiprocket deliver server-to-server events to dedicated, signature-verified, idempotent webhook endpoints (Section 61).
- **Source of truth:** restated from Document 02, Section 4 — VenopAI's own database, exposed exclusively through this API, is authoritative for every business entity listed in Document 01, Section 26. No client ever needs to (and none is permitted to) query Razorpay, Shiprocket, or Cloudinary directly for VenopAI business state.

---

## 3. API Architecture

```
Next.js Customer UI                Next.js Admin UI
        │                                  │
        │        HTTPS / JSON (Bearer JWT) │
        └────────────────┬─────────────────┘
                          ▼
                      FastAPI  (/api/v1)
        ┌─────────────────┼──────────────────────────────┐
        │                 │                              │
   ┌────┴────┐      ┌─────┴─────┐                  ┌─────┴─────┐
   │  auth   │      │  users    │                  │  admin    │
   │products │      │addresses  │                  │(role-     │
   │categories│     │cart       │                  │ scoped    │
   │search   │      │checkout   │                  │ views over│
   │reviews  │      │orders     │                  │ every     │
   │         │      │payments   │                  │ domain)   │
   │         │      │shipping   │                  │           │
   │         │      │manufacturing                 │           │
   │         │      │design/consultations/software │           │
   │         │      │projects   │                  │           │
   │         │      │files      │                  │           │
   │         │      │quotes     │                  │           │
   │         │      │notifications                 │           │
   └────┬────┘      └─────┬─────┘                  └─────┬─────┘
        │                 │                              │
        └─────────────────┼──────────────────────────────┘
                          ▼
                     PostgreSQL
                          │
                          ▼
              Celery Workers (async, Redis broker)
                          │
        ┌─────────────────┼──────────────────────────────┐
        ▼                 ▼                              ▼
    Razorpay          Shiprocket                 Cloudinary / Resend
 (payments,           (rates,                    (file storage /
  webhooks in)         tracking,                  email sending,
                        webhooks in)               both async)
```

Webhook endpoints (`/api/v1/webhooks/razorpay`, `/api/v1/webhooks/shiprocket`) sit alongside the domain routers but are unauthenticated-by-JWT (they authenticate via provider signature instead, Section 61) and are the only inbound entry points from external providers.

---

## 4. API Conventions

- **HTTP methods:** `GET` (read, safe, idempotent), `POST` (create or trigger an action), `PATCH` (partial update), `DELETE` (remove). `PUT` is not used in V1 — every update is partial (`PATCH`) or a distinct action endpoint (`POST .../approve`), avoiding ambiguity about full-replace semantics.
- **URL naming:** plural nouns for collections (`/products`, `/orders`), singular sub-resource nesting for ownership (`/orders/{order_id}/items` is not exposed directly — items are embedded in the Order response, since Document 03 never needs to fetch order items independently), kebab-case is not used — path segments are lowercase, single words or clear nouns (`quote-versions` is written as a nested path `/quotes/{id}/versions` rather than a flattened resource).
- **UUIDs:** every resource ID is a UUID (v4) string, per Document 02, Section 11. No sequential integer IDs are ever exposed.
- **Timestamps:** ISO 8601, UTC, with a trailing `Z` (e.g., `2026-09-05T10:15:00Z`), on every `created_at`/`updated_at` and status-specific timestamp field.
- **JSON / Content-Type:** `application/json` for all request/response bodies except file upload (`multipart/form-data`) and webhook payloads (raw JSON with a signature header, per provider spec).
- **Status codes:** governed by Section 55.
- **Pagination:** governed by Section 52.
- **Sorting/filtering:** governed by Section 53.
- **Search:** a dedicated `search` query parameter, not overloaded onto a generic `filter` mechanism (Section 9).
- **Field selection:** not supported in V1 — no `?fields=` sparse-fieldset mechanism, since no Document 03 screen requires reduced payloads and it would add complexity without a driving need.
- **Idempotency:** governed by Section 56.
- **Correlation IDs:** every response (success or error) includes a `request_id` (Document 02, Section 24), and every error body echoes it explicitly (Section 54) for support traceability.

---

## 5. Identifiers

- **Resource IDs:** UUIDv4 for every internal entity (User, Product, Order, Quote, ManufacturingRequest, etc.) — used directly in URLs (`/orders/{order_id}`).
- **Public-facing "friendly" identifiers:** a short, human-readable order/request number (e.g., `VNP-ORD-000123`, `VNP-MFG-000045`) is additionally generated and stored for display purposes only (Document 03, Section 19's "Order number, prominent, copyable") — it is a display attribute on the resource, never used as a URL path parameter, so the API remains UUID-keyed throughout.
- **External provider IDs:** stored and exposed only as opaque reference strings — `razorpay_order_id`, `razorpay_payment_id`, `shiprocket_shipment_id`, `awb_number` (Shiprocket's tracking number) — never as the resource's own primary identifier.
- **Payment/Shipment/Quote/File IDs:** all follow the same UUID convention as any other resource.
- **No database implementation details exposed:** no raw sequential auto-increment values, no internal table names, no ORM class names appear in any response.

---

## 6. Authentication API

All endpoints under `/api/v1/auth/`. None require an existing access token except `logout` and `me` (Section 20 of Document 02 governs the underlying mechanism).

### AUTH-API-001 — POST /api/v1/auth/register

**Purpose:** create a new customer account.
**Authentication:** none.
**Authorization:** none (public).
**Path Parameters:** none.
**Query Parameters:** none.
**Request Headers:** `Content-Type: application/json`.
**Request Body:**
```json
{
  "email": "student@example.com",
  "password": "StrongPassword123!",
  "full_name": "Aarav Sharma",
  "phone": "+919812345678"
}
```
**Validation Rules:** `email` valid format, unique (case-insensitive); `password` minimum 8 characters, at least one letter and one number; `full_name` required, 2–100 chars; `phone` optional, valid Indian mobile format.
**Business Rules:** account is created in `Registered` (unverified) state; a verification email is enqueued (AUTH-001).
**Response (201):**
```json
{
  "data": {
    "id": "3f1a1c0e-...",
    "email": "student@example.com",
    "full_name": "Aarav Sharma",
    "status": "registered",
    "created_at": "2026-09-05T10:15:00Z"
  },
  "request_id": "..."
}
```
**HTTP Status Codes:** `201` Created; `400` validation error; `409` email already registered.
**Error Responses:** `{"error": {"code": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists.", "request_id": "..."}}`.
**Side Effects:** creates `User` row (Registered), enqueues verification email (Celery, Document 02 §17).
**Idempotency:** not idempotent by design — a duplicate call with the same email correctly returns `409`.
**Rate Limiting:** strict (Section 60) — abuse-prone endpoint.
**Related Requirements:** Doc 01 AUTH-001; Doc 03 Registration flow (implied by Section 5, "Guest → Authenticated").

### AUTH-API-002 — POST /api/v1/auth/verify-email

**Purpose:** confirm a customer's email using the token sent on registration.
**Authentication:** none (the token itself is the credential).
**Request Body:** `{"token": "opaque-verification-token"}`.
**Validation:** token must exist, be unexpired, and unused.
**Business Rules:** `User.status` moves `Registered → Verified` (AUTH-001); token is marked used.
**Response (200):** `{"data": {"status": "verified"}, "request_id": "..."}`.
**Status Codes:** `200`; `400` invalid/expired/used token.
**Idempotency:** a repeat call with an already-used token returns `400` (`TOKEN_ALREADY_USED`), not a silent success, so the client can distinguish "already verified" from a genuine error and show an appropriate message.
**Rate Limiting:** moderate.
**Related Requirements:** AUTH-001.

### AUTH-API-003 — POST /api/v1/auth/resend-verification

**Purpose:** re-send the verification email.
**Authentication:** none (accepts an email address; does not confirm/deny existence in its success response to avoid account enumeration — always returns `202` regardless of whether the email exists).
**Request Body:** `{"email": "student@example.com"}`.
**Response (202):** `{"data": {"message": "If an account exists, a verification email has been sent."}, "request_id": "..."}`.
**Rate Limiting:** strict, per-email and per-IP, to prevent email-bombing abuse.

### AUTH-API-004 — POST /api/v1/auth/login

**Purpose:** authenticate and issue tokens.
**Authentication:** none.
**Request Body:** `{"email": "student@example.com", "password": "StrongPassword123!"}`.
**Validation:** both fields required.
**Business Rules:** credentials verified against the stored hash; a `Deactivated` account returns a specific error rather than generic invalid-credentials (Document 03, Section 5); an unverified account is allowed to log in (so it can reach the "please verify" banner) but every checkout/request-submission endpoint independently blocks on unverified status.
**Response (200):**
```json
{
  "data": {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": {"id": "...", "email": "...", "full_name": "...", "status": "verified"}
  },
  "request_id": "..."
}
```
A `Set-Cookie` header sets the HTTP-only refresh token cookie (Document 02, Section 20).
**Status Codes:** `200`; `401` invalid credentials; `403` account deactivated.
**Rate Limiting:** strict, per-account and per-IP (Section 60).
**Related Requirements:** AUTH-001, AUTH-002.

### AUTH-API-005 — POST /api/v1/auth/refresh

**Purpose:** exchange a valid refresh-token cookie for a new access token (and a rotated refresh cookie).
**Authentication:** the HTTP-only refresh cookie itself; a CSRF header (`X-CSRF-Token`) matching the double-submit value is required (Document 02, Section 20).
**Request Body:** none.
**Business Rules:** the presented refresh token must be unrevoked and unexpired; on success it is immediately revoked and replaced (rotation).
**Response (200):** same shape as login's `data.access_token`/`expires_in`; sets a new refresh cookie.
**Status Codes:** `200`; `401` invalid/expired/revoked refresh token (triggers the "session expired" UI flow, Document 03 §5).
**Idempotency:** intentionally not idempotent — reuse of an already-rotated (now-revoked) refresh token is treated as a potential theft signal and revokes the entire token family for that user, forcing a fresh login.

### AUTH-API-006 — POST /api/v1/auth/logout

**Purpose:** end the current session.
**Authentication:** access token (bearer) or refresh cookie, either accepted since logout may be called with an expired access token.
**Business Rules:** revokes the current refresh token; clears the cookie.
**Response (204):** no content.
**Status Codes:** `204`; `401` if neither credential is valid (harmless — client just clears local state).

### AUTH-API-007 — GET /api/v1/auth/me

**Purpose:** fetch the currently authenticated identity (customer or admin — resolved by token audience).
**Authentication:** access token required.
**Response (200):** `{"data": {"id": "...", "email": "...", "full_name": "...", "status": "verified", "is_admin": false}, "request_id": "..."}`.
**Status Codes:** `200`; `401` no/invalid token.

### AUTH-API-008 — POST /api/v1/auth/forgot-password

**Purpose:** initiate the password-reset flow.
**Authentication:** none.
**Request Body:** `{"email": "student@example.com"}`.
**Response (202):** identical enumeration-safe pattern to AUTH-API-003.
**Business Rules:** creates a single-use, time-limited reset token (AUTH-002), emails it.
**Rate Limiting:** strict.

### AUTH-API-009 — POST /api/v1/auth/reset-password

**Purpose:** complete a password reset.
**Authentication:** none (token is the credential).
**Request Body:** `{"token": "...", "new_password": "NewStrongPassword456!"}`.
**Validation:** same password rules as registration.
**Business Rules:** on success, revokes all existing refresh tokens for the account (forces re-login everywhere, per AUTH-002's security intent).
**Response (200):** `{"data": {"status": "password_reset"}, "request_id": "..."}`.
**Status Codes:** `200`; `400` invalid/expired/used token or weak password.
**Rate Limiting:** strict.

A separate **admin login** endpoint (`POST /api/v1/admin/auth/login`) exists with an identical contract shape but issues a token carrying the `is_admin`+`role` claim and is only ever validated against `AdminUser` records (Document 02, Section 20's "admin credential can never mint a customer-scoped token or vice versa").

---

## 7. User / Account APIs

Base: `/api/v1/users/`. All require an authenticated customer; every response is implicitly scoped to `current_user` (ACCT-001) — there is no "get user by ID" endpoint for customers.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| USER-API-001 | GET | `/api/v1/users/me` | Fetch full profile (superset of AUTH-API-007 for the account/Profile screen) |
| USER-API-002 | PATCH | `/api/v1/users/me` | Update `full_name`, `phone` (email change routed separately, below) |
| USER-API-003 | POST | `/api/v1/users/me/email-change` | Request a change of the account's email of record; triggers re-verification (Document 03 §35) |
| USER-API-004 | POST | `/api/v1/users/me/password-change` | Change password while authenticated (distinct from the forgot/reset flow) |
| USER-API-005 | GET | `/api/v1/addresses` | List the customer's saved addresses |
| USER-API-006 | POST | `/api/v1/addresses` | Add a new address |
| USER-API-007 | PATCH | `/api/v1/addresses/{address_id}` | Edit an address, including `is_default` |
| USER-API-008 | DELETE | `/api/v1/addresses/{address_id}` | Remove an address |

**USER-API-002 example request:** `{"full_name": "Aarav Kumar Sharma", "phone": "+919812345678"}`. Email is never editable via this endpoint (USER-API-003 handles that with its own verification requirement, ADDR-002-equivalent safety).

**USER-API-006 example request:**
```json
{
  "recipient_name": "Aarav Sharma",
  "phone": "+919812345678",
  "line1": "12 MG Road",
  "line2": "Near City Mall",
  "city": "Hyderabad",
  "state": "Telangana",
  "pincode": "500001",
  "is_default": true
}
```
**Validation:** `pincode` is checked against Shiprocket serviceability (Section 19) at save time as a courtesy, but the authoritative check is always re-run at checkout (ADDR-002) — this endpoint never blocks saving an address purely for unserviceability, only warns.
**Ownership/IDOR:** `PATCH`/`DELETE` verify `address.user_id == current_user.id` before any write; a mismatch returns `404` (not `403`), so the existence of another customer's address ID is never confirmed (Section 59).
**Business Rules:** setting `is_default: true` atomically unsets the previous default (Document 02 §8, USERS module).

---

## 8. Product Catalog APIs

Base: `/api/v1/products/`, `/api/v1/categories/`. All public (no authentication required).

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| CAT-API-001 | GET | `/api/v1/products` | List/browse products |
| CAT-API-002 | GET | `/api/v1/products/{product_id}` | Product detail |
| CAT-API-003 | GET | `/api/v1/categories` | List categories (two-level tree) |
| CAT-API-004 | GET | `/api/v1/categories/{category_id}` | Category detail (with its products, paginated) |

### CAT-API-001 — GET /api/v1/products

**Query Parameters:** `category` (category UUID, optional), `min_price`, `max_price` (optional), `availability` (`in_stock`/`out_of_stock`, optional), `sort` (`relevance`\*, `price_asc`, `price_desc`, `newest`; \*relevance only meaningful combined with `search`, otherwise defaults to `newest`), `page`, `page_size` (Section 52).
**Business Rules:** only `Active` products are ever returned (CAT-001); `stock_status` is computed and included per item but the underlying `Inventory.reserved_quantity` is never exposed publicly (admin-only field, Section 40).
**Response (200):**
```json
{
  "data": [
    {
      "id": "b2e1...",
      "name": "Arduino Uno R3",
      "price": "1499.00",
      "currency": "INR",
      "stock_status": "in_stock",
      "primary_image_url": "https://res.cloudinary.com/.../uno.jpg",
      "category_ids": ["cat-uuid-1"]
    }
  ],
  "pagination": {"page": 1, "page_size": 24, "total_items": 132, "total_pages": 6},
  "request_id": "..."
}
```
**Status Codes:** `200`; `400` invalid filter/sort value.

### CAT-API-002 — GET /api/v1/products/{product_id}

**Response (200):** full product detail — name, description, specifications (key-value array), price, `stock_status`, image URLs, category references — matching Document 03, Section 14. Never includes admin-only fields (cost price, if such existed — Document 01 defines no such field, so none is modeled).
**Status Codes:** `200`; `404` not found or not `Active` (an inactive product returns `404` to public callers, consistent with CAT-001).

---

## 9. Search API

### SEARCH-API-001 — GET /api/v1/search/products

**Purpose:** keyword search over the catalog (SRCH-001).
**Authentication:** none.
**Query Parameters:** `q` (required, the search term), plus every filter/sort parameter from CAT-API-001 (category, price range, availability, sort — defaulting to `relevance`), `page`, `page_size`.
**Business Rules:** implemented via PostgreSQL full-text/trigram search (Document 02, Section 5/28) over `name`, `description`; no Elasticsearch-specific behavior or endpoint exists.
**Response (200):** identical shape to CAT-API-001's response, plus `"query": "arduino"` echoed at the top level.
**Empty results:** `data: []` plus a `suggested_categories` array (SRCH-002) — the one deliberate addition beyond the plain product list, since Document 03 §15 requires this specific no-result behavior.
**Status Codes:** `200`; `400` missing `q`.

An autocomplete convenience endpoint is included since Document 03, Section 15 explicitly calls for it as "a direct extension of keyword search":

### SEARCH-API-002 — GET /api/v1/search/autocomplete

**Query Parameters:** `q` (required, minimum 2 characters).
**Response (200):** `{"data": {"suggestions": ["Arduino Uno R3", "Arduino Nano"]}, "request_id": "..."}` — product names only, capped at 8 results, no pagination (a lightweight, low-latency endpoint by design).

---

## 10. Cart API

Base: `/api/v1/cart/`. Authenticated customers only (Document 03 allows guest cart client-side, but the API models the persisted cart per CART-003 — a guest's cart is a purely client-side/local concept until they authenticate, at which point CART-API-002 populates the server cart).

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| CART-API-001 | GET | `/api/v1/cart` | Fetch the current cart |
| CART-API-002 | POST | `/api/v1/cart/items` | Add a product (or increase quantity if already present) |
| CART-API-003 | PATCH | `/api/v1/cart/items/{item_id}` | Update a line item's quantity |
| CART-API-004 | DELETE | `/api/v1/cart/items/{item_id}` | Remove a line item |
| CART-API-005 | DELETE | `/api/v1/cart` | Clear the entire cart |

### CART-API-002 — POST /api/v1/cart/items

**Request Body:** `{"product_id": "b2e1...", "quantity": 2}`.
**Validation:** `quantity >= 1`; product must exist and be `Active`.
**Business Rules:** performs a **soft** availability check only (`quantity <= available_quantity` at the moment of the call) — this is advisory, non-blocking beyond a reasonable ceiling, and explicitly **does not create an `InventoryReservation`** (CART-001, restated as the single most important rule in this section). If the soft check fails, the response still succeeds but flags `stock_warning: true` on the item (mirroring Document 03 §16's non-blocking cart warning) rather than rejecting the add outright — since stock can fluctuate and the cart is not the enforcement point.
**Response (200):**
```json
{
  "data": {
    "id": "cart-uuid",
    "items": [
      {"id": "item-uuid", "product_id": "b2e1...", "name": "Arduino Uno R3", "unit_price": "1499.00", "quantity": 2, "line_total": "2998.00", "stock_warning": false}
    ],
    "subtotal": "2998.00",
    "currency": "INR"
  },
  "request_id": "..."
}
```
**Status Codes:** `200`; `400` invalid quantity; `404` product not found/inactive.
**Idempotency:** calling this twice with the same product simply increases quantity — this is an intentional, well-defined (non-idempotent-in-the-strict-sense but predictable) behavior, not a bug; a client wanting an exact quantity uses `PATCH` instead.

---

## 11. Checkout API

Base: `/api/v1/checkout/`. Authenticated + verified customer required (CHK-001). This is the single most business-rule-dense customer-facing domain outside Manufacturing.

### CHECKOUT-API-001 — POST /api/v1/checkout/sessions

**Purpose:** begin checkout from the current cart — this single call performs the **hard** stock check and creates the ~15-minute `InventoryReservation` (CHK-003, INV-002/003), replacing the separate "validate" and "reserve" steps the instructions suggested as options, since Document 02's design has these happen atomically in one guarded transaction (Section 12) — splitting them into two calls would only introduce a race window between them.
**Authentication:** required, verified.
**Request Body:** `{"address_id": "addr-uuid"}` (must be one of the customer's own saved addresses, or omitted to checkout address-less and select one in a follow-up call — V1 requires an address to open a session, since serviceability must be known to even attempt reservation against a deliverable order, so `address_id` is required, not optional).
**Business Rules:** for each cart line item, row-locks the corresponding `Inventory`, verifies `available_quantity >= quantity`; on success creates one `InventoryReservation` per line item (`expires_at = now + 15m`) in a single transaction (Document 02 §12); on any line item's failure, the entire session creation fails and returns which items are insufficient (CHK checkout is all-or-nothing at session-open time, avoiding a partially reserved cart).
**Response (201):**
```json
{
  "data": {
    "checkout_session_id": "sess-uuid",
    "items": [{"product_id": "...", "name": "...", "quantity": 2, "unit_price": "1499.00"}],
    "address": {"id": "addr-uuid", "...": "..."},
    "reservation_expires_at": "2026-09-05T10:30:00Z",
    "shipping": {"rate": "60.00", "eta_days_min": 3, "eta_days_max": 5},
    "tax": {"type": "IGST", "amount": "245.82"},
    "subtotal": "2998.00",
    "total": "3303.82"
  },
  "request_id": "..."
}
```
**Status Codes:** `201`; `400` empty cart; `409` `INSUFFICIENT_STOCK` (with per-item detail) — Document 03 §17's "out-of-stock during checkout" flow consumes this; `422` address unserviceable.
**Idempotency:** a repeat call while an active (unexpired) session already exists for this cart returns the existing session rather than creating a second, conflicting reservation set — enforced by checking for an existing non-expired session tied to the customer before creating a new one.
**Related Requirements:** CHK-001–004, INV-001–006.

### CHECKOUT-API-002 — GET /api/v1/checkout/sessions/{session_id}

**Purpose:** re-fetch a session (e.g., on page refresh) to read the live reservation countdown (Document 03 §17's persistent indicator).
**Response (200):** same shape as creation; if expired, `"status": "expired"` and the reservation-dependent fields are nulled, with the client expected to route back to Cart (Document 03 §17).
**Status Codes:** `200`; `404` not found or not owned by caller (Section 59).

### CHECKOUT-API-003 — POST /api/v1/checkout/sessions/{session_id}/address

**Purpose:** change the address on an open (unexpired) session — recalculates shipping/tax without resetting the reservation timer (a customer switching addresses shouldn't lose their held stock).
**Request Body:** `{"address_id": "new-addr-uuid"}`.
**Status Codes:** `200`; `409` session expired; `422` new address unserviceable.

Payment initiation against an open checkout session is covered in Section 16 (`PAYMENT-API-001`), which is the step that ultimately creates the `Order` on verified success (ORD-001) — there is no separate `POST /api/v1/orders` endpoint for direct customer-initiated order creation, since Document 01 (ORD-001) and Document 02 (§13) are explicit that order creation only ever happens as a side effect of verified payment, never as its own directly callable action.

---

## 12. Inventory API

**Customer-facing:** availability is exposed only indirectly, embedded in `stock_status` on Product responses (CAT-API-001/002) — there is no standalone customer-facing inventory-detail endpoint, since Document 03 never requires a customer to see raw reservation/available numbers.

**Admin-facing:** base `/api/v1/admin/inventory/`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-INV-API-001 | GET | `/api/v1/admin/inventory` | List inventory across all products (stock/reserved/available) |
| ADMIN-INV-API-002 | GET | `/api/v1/admin/inventory/{product_id}` | Single product's inventory detail |
| ADMIN-INV-API-003 | POST | `/api/v1/admin/inventory/{product_id}/adjust` | Manual stock adjustment (Document 01 §21) |
| ADMIN-INV-API-004 | GET | `/api/v1/admin/inventory/{product_id}/reservations` | List active reservations against this product (troubleshooting view, Document 03 §38) |

**ADMIN-INV-API-003 request:** `{"delta": -5, "reason": "Damaged units removed from stock"}` — `reason` is required and written to `AuditEvent` (AUDIT-001/002); this is the only way `stock_quantity` is ever changed outside the order-fulfillment path.
**Authorization:** `ORDER_MANAGER` or `SUPER_ADMIN` only (Document 02 §21).
**Response formula restated:** every inventory object returned anywhere in the API always includes all three fields explicitly: `{"stock_quantity": 40, "reserved_quantity": 6, "available_quantity": 34}` — `available_quantity` is always server-computed, never client-supplied or client-trusted.

---

## 13. Inventory Reservation Contract

Directly operationalizes Document 02, Section 12.

- **Creation:** exactly at `CHECKOUT-API-001` (Section 11) — never at cart-add time (CART-001).
- **Expiration:** a reservation past `expires_at` and still `ACTIVE` is asynchronously released by the scheduled Celery job (Document 02 §19); the API surfaces this state change passively — `CHECKOUT-API-002` simply reflects `"status": "expired"` once the sweep (or a just-in-time check at payment time) has run.
- **Release:** also triggered immediately (not waiting for the sweep) when: (a) `PAYMENT-API-002` (verify) resolves to `Failed`, or (b) the customer explicitly abandons the session — there is no explicit "cancel checkout" endpoint; abandonment is simply detected by the reservation's own expiry or the failed-payment release, keeping the contract simple.
- **Conversion into sale:** on verified payment success (`PAYMENT-API-002`/webhook), the reservation's items are atomically consumed and the `Order` is created in the same transaction (Document 02 §13) — this is the *only* path that permanently decrements `stock_quantity`.
- **Failure scenarios, explicitly contracted:**
  - **Reservation expires before payment attempt:** any subsequent call to `PAYMENT-API-001` against that session returns `409 RESERVATION_EXPIRED`.
  - **Payment succeeds after reservation expiry (race):** the webhook/verification handler re-checks reservation validity before consuming it; if the reservation already expired and its stock was released (and possibly resold), the payment is still marked `Successful` (money was legitimately captured) but order fulfillment is **not** silently completed against now-unavailable stock — instead the order is created in a `Payment Received — Stock Conflict` administrative-review sub-state (surfaced to `ORDER_MANAGER`/`FINANCE_MANAGER` for manual resolution: expedited restock, substitution, or refund) rather than either double-selling a unit or silently dropping a paid customer's order. This is a controlled assumption (see Section 84/consistency notes) since Document 01 does not name this exact edge case, but it is the only response consistent with "never oversell" (INV-006) and "never leave a paid customer without resolution."
  - **Another customer buys the stock first:** cannot happen while a reservation is `ACTIVE` (the row lock at creation time, Document 02 §12, structurally prevents two active reservations from double-counting the same units) — this scenario is only reachable via the expiry race above, handled identically.
  - **Payment fails:** reservation is released immediately (see Release, above); stock returns to `available` right away, not after the full 15 minutes.
  - **Order is cancelled (post-payment, pre-fulfillment):** does not automatically return stock to `available_quantity` (Document 02 §12's cancellation note) — it requires an explicit `ADMIN-INV-API-003` adjustment, since a cancellation may be paired with a refund decision that hasn't yet been made.

---

## 14. Order APIs

Base: `/api/v1/orders/`. Customer-facing, always scoped to `current_user` (ACCT-001).

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ORDER-API-001 | GET | `/api/v1/orders` | List the customer's own orders |
| ORDER-API-002 | GET | `/api/v1/orders/{order_id}` | Order detail |
| ORDER-API-003 | POST | `/api/v1/orders/{order_id}/cancel` | Request cancellation (pre-fulfillment only, ORD-003) |
| ORDER-API-004 | GET | `/api/v1/orders/{order_id}/invoice` | Download the invoice (returns a signed, short-lived file URL) |

### ORDER-API-001 — GET /api/v1/orders

**Query Parameters:** `status` (optional filter, one of the Order states — Section 15), `page`, `page_size`.
**Response (200):** paginated list of order summaries (id, friendly number, status, payment_status, total, created_at, item_count).

### ORDER-API-002 — GET /api/v1/orders/{order_id}

**Response (200):**
```json
{
  "data": {
    "id": "ord-uuid",
    "order_number": "VNP-ORD-000123",
    "status": "processing",
    "payment_status": "successful",
    "items": [{"product_id": "...", "name": "Arduino Uno R3", "unit_price": "1499.00", "quantity": 2, "line_total": "2998.00"}],
    "subtotal": "2998.00",
    "shipping_amount": "60.00",
    "tax": {"type": "IGST", "amount": "245.82"},
    "total": "3303.82",
    "shipping_address": {"...": "..."},
    "shipment": {"id": "ship-uuid", "status": "shipped", "tracking_number": "AWB123456", "carrier": "Delhivery via Shiprocket"},
    "estimated_delivery": "2026-09-10",
    "created_at": "2026-09-05T10:32:00Z",
    "paid_at": "2026-09-05T10:33:10Z"
  },
  "request_id": "..."
}
```
Note `status` (order/fulfillment), `payment_status`, and `shipment.status` are three explicitly separate fields — never merged (ORD-002, Document 03 §20).
**Status Codes:** `200`; `404` not found or not owned (Section 59).

### ORDER-API-003 — POST /api/v1/orders/{order_id}/cancel

**Business Rules:** allowed only while `status` is in `{pending_payment, paid, processing}` (pre-fulfillment) — `ready_to_ship` and beyond reject with `409` (ORD-003). Triggers the refund workflow if payment was already successful (an internal notification to `FINANCE_MANAGER`, not an automatic refund — Section 21 of Doc 01 keeps refund a human-authorized step).
**Response (200):** updated order with `status: "cancelled"`.
**Status Codes:** `200`; `409` `ORDER_NOT_CANCELLABLE`.

---

## 15. Order State Contract

| State | Meaning | Who Triggers | Allowed Next States | Invalid Transitions |
|---|---|---|---|---|
| `pending_payment` | Reservation/session open, payment not yet confirmed | System (on checkout session creation) | `paid`, (implicitly abandoned/expired — no order row exists yet at this point; restated: `pending_payment` is conceptually the checkout-session phase, not yet a persisted `Order` row — see note below) | — |
| `paid` | Payment verified; order row created | System (on verified payment) | `processing`, `cancelled` | Cannot go directly to `shipped`/`delivered` |
| `processing` | Order is being prepared for dispatch | Admin (`ORDER_MANAGER`) | `ready_to_ship`, `cancelled` | Cannot skip to `shipped` without `ready_to_ship` |
| `ready_to_ship` | Ready for carrier pickup | Admin | `shipped` | Cannot revert to `processing` |
| `shipped` | Shipment created and picked up | System (on Shiprocket shipment creation confirmation) | `delivered`, (`shipping exception` — a sub-flag, not a separate top-level state, surfaced via `shipment.status`) | Cannot cancel from here via ORDER-API-003 |
| `delivered` | Carrier confirms delivery | System (on Shiprocket delivery event) | `completed` | — |
| `completed` | Terminal — review eligibility unlocked | System (automatic shortly after delivery, or admin-confirmed) | — (terminal) | — |
| `cancelled` | Terminal | Customer (pre-fulfillment) or Admin | — (terminal) | — |

**Note on `pending_payment`:** per ORD-001, no `Order` row is ever created before verified payment — so `pending_payment` is not a real, queryable `Order.status` value; it is presented here for completeness with the source instructions' example list, but the actual implementation begins the `Order` state machine at `paid`. This is called out explicitly as a documented deviation from the instructions' example list, made necessary by Document 01/02's own stricter rule (ORD-001) — the checkout session (Section 11) is what represents the pre-payment phase, not an `Order`.

---

## 16. Payment API

Base: `/api/v1/payments/`. Razorpay is the sole provider (PAY-001).

### PAYMENT-API-001 — POST /api/v1/payments/initiate

**Purpose:** create a Razorpay payment intent against either an open checkout session (commerce) or an Approved quote (service) — a single unified endpoint since the downstream mechanics (Document 02 §14) are identical; the `source` field disambiguates.
**Authentication:** required, verified customer.
**Request Body:**
```json
{ "source_type": "checkout_session", "source_id": "sess-uuid" }
```
or
```json
{ "source_type": "quote", "source_id": "quote-uuid" }
```
**Validation/Business Rules:** for `checkout_session` — session must exist, be unexpired, and owned by caller. For `quote` — the referenced `QuoteVersion` must be the current (non-superseded) version and in `Approved` status (QUOTE-001/PAY-005) — any other status returns `409 QUOTE_NOT_APPROVED`, the single most important guard in this endpoint.
**Response (201):**
```json
{
  "data": {
    "payment_id": "pay-uuid",
    "razorpay_order_id": "order_LkjH...",
    "amount": "3303.82",
    "currency": "INR",
    "key_id": "rzp_live_public_key_id"
  },
  "request_id": "..."
}
```
(`key_id` is Razorpay's public key, safe to expose to the frontend to open the Checkout widget — never a secret key, Document 02 §22.)
**Status Codes:** `201`; `404` session/quote not found or not owned; `409` `RESERVATION_EXPIRED` / `QUOTE_NOT_APPROVED` / `QUOTE_SUPERSEDED`.
**Idempotency:** a repeat call against the same still-valid source returns the existing `Pending` `Payment`'s Razorpay order rather than creating a duplicate Razorpay order (checked by looking for an existing non-terminal `Payment` linked to that source).

### PAYMENT-API-002 — POST /api/v1/payments/{payment_id}/confirm

**Purpose:** the frontend's post-Razorpay-widget callback path (Document 03 §18's "Confirming your payment…" step) — verifies the Razorpay signature server-side before treating anything as successful (PAY-002).
**Request Body:** `{"razorpay_payment_id": "pay_MnO...", "razorpay_order_id": "order_LkjH...", "razorpay_signature": "..."}`.
**Business Rules:** signature verified via `RazorpayProvider.verify_payment` (Document 02 §14); on valid signature, calls the same idempotent `markSuccessful` path also used by the webhook (Section 17) — whichever of the two (this call or the webhook) arrives first performs the transition; the second is a no-op returning the same successful result (Document 02 §14's race-condition handling, PAY-004).
**Response (200), success:** `{"data": {"payment_id": "...", "status": "successful", "order_id": "ord-uuid"}, "request_id": "..."}` (for a commerce payment — `order_id` is null/absent for a service-quote payment, which instead returns the execution-unlocked request reference).
**Response (200), still pending (webhook hasn't landed yet):** `{"data": {"payment_id": "...", "status": "pending_verification"}, "request_id": "..."}` — this is the state that drives Document 03 §18's "Payment Requires Verification" UI after the client's own short timeout.
**Status Codes:** `200` in both outcomes above (this is deliberately not a `4xx` for the pending case — it is a legitimate, expected intermediate state, not an error); `400` invalid signature (a genuine tampering/error case).
**Idempotency:** fully idempotent — safe to call multiple times.

### PAYMENT-API-003 — GET /api/v1/payments/{payment_id}

**Purpose:** poll/fetch current payment status (used by the frontend while in the "Confirming…"/"Requires Verification" states, and by the customer account's Payments screen).
**Response (200):** `{"data": {"id": "...", "status": "pending|successful|failed|refunded", "amount": "...", "linked_order_id": "...", "linked_quote_id": "...", "created_at": "...", "confirmed_at": "..."}, "request_id": "..."}`.
**Status Codes:** `200`; `404` not found/not owned.

### PAYMENT-API-004 — GET /api/v1/payments

**Purpose:** the customer's Payments & Invoices list screen (Document 03 §21).
**Query Parameters:** `page`, `page_size`.
**Response (200):** paginated list of the customer's own payment records.

### PAYMENT-API-005 — POST /api/v1/admin/payments/{payment_id}/refund

**Purpose:** admin-initiated refund (`FINANCE_MANAGER`/`SUPER_ADMIN` only).
**Request Body:** `{"amount": "3303.82", "reason": "Order cancelled before shipment"}` (amount defaults to full payment amount if omitted; may be less for a partial refund).
**Business Rules:** only callable against a `Successful` payment; calls `RazorpayProvider.initiate_refund`; creates a `Refund` record; updates `Payment.status` to `refunded` (or `partially_refunded`, Section 18) only once Razorpay confirms — not optimistically.
**Response (202):** `{"data": {"refund_id": "...", "status": "initiated"}, "request_id": "..."}` (asynchronous — final confirmation follows via the same webhook-processing path).
**Status Codes:** `202`; `409` payment not in a refundable state; `403` insufficient role.

---

## 17. Payment Webhook

### WEBHOOK-API-001 — POST /api/v1/webhooks/razorpay

**Purpose:** receive Razorpay's server-to-server payment/refund events.
**Authentication:** none via JWT — authenticated exclusively via Razorpay's HMAC webhook signature header (`X-Razorpay-Signature`), verified against the raw request body before any parsing occurs (Document 02 §14/§22).
**Request Body:** Razorpay's native event payload (not redefined here — treated as an opaque, provider-owned schema, normalized internally per Section 62).
**Business Rules / Flow:**
1. Verify signature. Invalid → `400`, event discarded, logged as a security event (Document 02 §22).
2. Extract Razorpay's event ID; check against previously processed event IDs. Duplicate → respond `200` immediately without reprocessing (PAY-004) — Razorpay must always receive a `2xx` for an event it will otherwise keep retrying.
3. Enqueue a Celery task with the verified, parsed event; return `200` immediately (Document 02 §14 — webhook processing is kept out of the request/response cycle).
4. The Celery task calls the same idempotent `markSuccessful`/`markFailed`/`markRefunded` service methods used by `PAYMENT-API-002`/`PAYMENT-API-005`.
**Response:** always `200` on any successfully *received and verified* event (even if business processing is deferred to the async task) — a `4xx`/`5xx` is reserved strictly for verification failure or a genuinely malformed request, so Razorpay's own retry behavior is only invoked when truly warranted.
**Idempotency:** guaranteed by event-ID deduplication (Section 56) plus the underlying idempotent state-transition methods (belt-and-suspenders, Document 02 §26).
**Retry Strategy:** relies on Razorpay's own webhook retry for transient VenopAI-side outages (a `5xx` response); VenopAI's Celery task itself also retries on transient internal failure (e.g., a momentary DB issue) before giving up and relying on the reconciliation sweep (Document 02 §19) as a final safety net.

---

## 18. Payment State Contract

| State | Meaning | Valid Transitions |
|---|---|---|
| `pending` | Payment intent created, awaiting completion | → `successful`, → `failed` |
| `successful` | Server-verified successful capture | → `refunded`, → `partially_refunded` |
| `failed` | Verified failure or expiry | (terminal) |
| `refunded` | Full refund confirmed by Razorpay | (terminal) |
| `partially_refunded` | Partial refund confirmed | → `refunded` (if a further refund completes the remainder) |

No `created`/`authorized`/`captured` intermediate states are modeled separately from `pending`/`successful` — Razorpay's own capture flow (auto-capture) means VenopAI does not need a distinct "authorized but not captured" customer-facing state for V1; this is a deliberate simplification consistent with not inventing states Document 01 doesn't require.

---

## 19. Shipping API

Base: `/api/v1/shipping/` (customer-facing serviceability/rate lookups) and shipment access nested under Orders/Manufacturing.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| SHIP-API-001 | GET | `/api/v1/shipping/serviceability` | Check if a PIN code is serviceable (`?pincode=500001`) |
| SHIP-API-002 | GET | `/api/v1/shipments/{shipment_id}` | Shipment detail (normalized) |
| SHIP-API-003 | GET | `/api/v1/shipments/{shipment_id}/tracking` | Tracking history |
| ADMIN-SHIP-API-001 | POST | `/api/v1/admin/orders/{order_id}/shipment` | Admin creates a shipment for a Ready-to-Ship order |
| ADMIN-SHIP-API-002 | POST | `/api/v1/admin/manufacturing/{request_id}/shipment` | Admin creates a shipment for a completed physical manufacturing/design deliverable |

**SHIP-API-001 response:** `{"data": {"pincode": "500001", "serviceable": true, "estimated_days_min": 3, "estimated_days_max": 5}, "request_id": "..."}` — a thin, normalized wrapper around Shiprocket's serviceability check (Section 62); rate/ETA are embedded directly in the Checkout session response (Section 11) rather than requiring a separate rate-lookup call from the client.

**SHIP-API-002 response:** `{"data": {"id": "ship-uuid", "order_id": "ord-uuid", "carrier": "Delhivery", "tracking_number": "AWB123456", "status": "in_transit", "estimated_delivery": "2026-09-10", "created_at": "..."}, "request_id": "..."}` — never exposes Shiprocket's raw internal shipment ID or raw status vocabulary; always the normalized VenopAI status set (Section 62 example: Shiprocket's internal codes map to `created`/`in_transit`/`out_for_delivery`/`delivered`/`exception`/`returned`).

**SHIP-API-003 response:** `{"data": {"events": [{"status": "in_transit", "description": "Shipment picked up", "occurred_at": "..."}]}, "request_id": "..."}` — a normalized timeline, feeding Document 03's Timeline component (Section 20 of Doc 03).

---

## 20. Shipping Webhook

### WEBHOOK-API-002 — POST /api/v1/webhooks/shiprocket

**Purpose:** receive Shiprocket's shipment/tracking status events (where Shiprocket's plan/API tier provides webhook delivery; the scheduled polling task, Document 02 §19, is the fallback where it doesn't).
**Authentication:** verified via whatever signature/shared-secret mechanism Shiprocket's webhook offering supports at implementation time (Document 02 leaves the exact mechanism to be confirmed against Shiprocket's current API — this document specifies the *behavioral* contract, not Shiprocket's specific header name).
**Business Rules / Flow:** identical shape to the Razorpay flow (Section 17) — verify → dedupe by Shiprocket's own event/tracking-update ID → enqueue Celery task → task updates `Shipment.status` and appends a tracking event → if the new status is `delivered`, triggers the Order/Manufacturing-request status transition and the corresponding notification (Document 01 §17).
**Response:** `200` on any verified, received event.
**Idempotency:** event-ID deduplication identical in principle to Section 17.

---

## 21. Manufacturing API

Base: `/api/v1/manufacturing/requests/`. This and Section 24's shared architecture are the largest domain in the API, matching Document 01/03's emphasis on Manufacturing as the core differentiator.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| MFG-API-001 | POST | `/api/v1/manufacturing/requests` | Submit a new manufacturing request |
| MFG-API-002 | GET | `/api/v1/manufacturing/requests` | List the customer's own requests |
| MFG-API-003 | GET | `/api/v1/manufacturing/requests/{request_id}` | Request detail |
| MFG-API-004 | POST | `/api/v1/manufacturing/requests/{request_id}/cancel` | Cancel (rules vary by stage, MFG-004/005/006) |
| MFG-API-005 | GET | `/api/v1/manufacturing/requests/{request_id}/clarifications` | List clarification Q&A (Section 23) |
| MFG-API-006 | POST | `/api/v1/manufacturing/requests/{request_id}/clarifications/{clarification_id}/respond` | Customer answers an open clarification question |
| MFG-API-007 | GET | `/api/v1/manufacturing/requests/{request_id}/history` | Status/timeline history (feeds the Timeline component, Document 03 §23) |

### MFG-API-001 — POST /api/v1/manufacturing/requests

**Request Body:**
```json
{
  "title": "Smart Energy Monitor Enclosure + PCB Assembly",
  "project_overview": "A small enclosed device that monitors household energy usage...",
  "prototype_type": "pcb_assembly",
  "quantity": 5,
  "technical_requirements": "Must fit a 60x40mm PCB, operate on 5V USB power...",
  "dimensions": {"length_mm": 80, "width_mm": 50, "height_mm": 25},
  "materials": "ABS plastic enclosure, FR4 PCB",
  "pcb_hardware_details": "2-layer PCB, through-hole components preferred",
  "manufacturing_requirements": "Matte black finish",
  "delivery_requirements": "Needed within 3 weeks if possible",
  "additional_notes": "",
  "file_ids": ["file-uuid-1", "file-uuid-2"],
  "project_id": null
}
```
**Validation:** `title`, `project_overview`, `prototype_type`, `quantity` (>=1) are required (matching Document 03 §24's hard-required fields); `dimensions`/`materials`/`pcb_hardware_details`/`manufacturing_requirements`/`delivery_requirements`/`additional_notes` optional; `file_ids` must reference files already uploaded (Section 29) via a prior `FILES-API-001` call, owned by the caller, and not yet associated with another request (FILE-002); `project_id`, if provided, must reference a `Project` owned by the caller.
**Business Rules:** creates the request in `submitted` status; associates the referenced files; requires `current_user.status == verified` (AUTH-001) or returns `403 EMAIL_NOT_VERIFIED`.
**Response (201):** the full request object (see MFG-API-003 shape) with `status: "submitted"`.
**Status Codes:** `201`; `400` validation error; `403` unverified email; `422` a referenced `file_id` doesn't belong to the caller or is already associated elsewhere.
**Idempotency:** not idempotent (a genuine new submission each time) — the frontend's duplicate-submit protection (Document 03 §10, "Processing" state disabling the button) is the primary safeguard; the backend additionally rejects an identical-payload resubmission within a short window (e.g., 30 seconds) as a defensive measure against double-click/network-retry duplicates (Document 01 §24, "duplicate request submission").

### MFG-API-003 — GET /api/v1/manufacturing/requests/{request_id}

**Response (200):** full detail — all submitted fields, `status`, embedded `files` array (split into `customer_uploaded`/`delivered`, mirroring Document 03 §23's FileList grouping), embedded `current_quote` summary (if any — full detail via Section 32's Quote APIs), `project_id` (if linked), timestamps for each status transition reached so far.
**Status Codes:** `200`; `404` not found or not owned (Section 59).

### MFG-API-004 — POST /api/v1/manufacturing/requests/{request_id}/cancel

**Request Body:** `{"reason": "No longer needed"}` (optional free text).
**Business Rules (directly implementing MFG-004/005/006):**
- If `status` is pre-payment (`submitted` through `awaiting_approval`): cancels immediately, `status → cancelled`.
- If `status` is `payment_pending`/`paid` but execution has not started: cancels immediately and flags a refund for `FINANCE_MANAGER` review (same human-authorized pattern as `ORDER-API-003`).
- If `status` is `in_progress` (execution started) or later: does **not** cancel immediately — instead creates a `cancellation_requested` sub-flag and routes to the admin cancellation-review queue (Document 03 §23/§41); response reflects `status` unchanged but `cancellation_requested: true`.
**Response (200):** updated request object.
**Status Codes:** `200`; `409` already in a terminal state.

---

## 22. Manufacturing State Contract

| State | Customer Visibility | Allowed Customer Actions | Allowed Admin Actions | Next States |
|---|---|---|---|---|
| `submitted` | Full | Cancel | Begin review, request clarification | `under_review`, `clarification_needed`, `cancelled` |
| `under_review` | Full | Cancel | Confirm requirements, request clarification | `requirements_confirmed`, `clarification_needed`, `cancelled` |
| `clarification_needed` | Full, plus open questions | Respond to clarification, cancel | Review responses, raise further questions | `under_review`, `requirements_confirmed`, `cancelled` |
| `requirements_confirmed` | Full | Cancel | Create quote | `quote_ready`, `cancelled` |
| `quote_ready` (= "awaiting approval" in Doc 03) | Full quote detail | Approve, reject, cancel | Revise quote (creates new version) | `payment_pending` (on approval), `clarification_needed` (on rejection, if renegotiating), `cancelled` |
| `payment_pending` | Full | Pay, cancel | — | `in_progress` (on verified payment) |
| `in_progress` | Full, plus admin-posted status notes | Request cancellation (review-gated) | Post status updates, mark execution complete | `completed_execution` |
| `completed_execution` | Full, with delivery/tracking | Track delivery | Create shipment (physical) or attach deliverables (digital) | `delivered` |
| `delivered` | Full | Confirm receipt, leave review | Mark request `completed` | `completed` |
| `completed` | Full (terminal) | Leave review, view deliverables | — | (terminal) |
| `cancelled` | Full (terminal) | — | — | (terminal) |

`clarification_needed` can recur multiple times (e.g., `requirements_confirmed → clarification_needed` if an admin later needs more detail before quoting) — this is a valid, expected loop, not an invalid transition.

---

## 23. Manufacturing Clarification API

Structured, asynchronous, request-scoped (CONSULT-001-style pattern extended here) — explicitly not a general chat system.

### MFG-API-005 — GET /api/v1/manufacturing/requests/{request_id}/clarifications

**Response (200):**
```json
{
  "data": [
    {
      "id": "clar-uuid-1",
      "question": "What voltage does this need to operate at?",
      "raised_by": "admin",
      "raised_at": "2026-09-05T11:00:00Z",
      "status": "resolved",
      "response": {"text": "5V USB power.", "responded_at": "2026-09-05T12:00:00Z", "attached_file_ids": []}
    },
    {
      "id": "clar-uuid-2",
      "question": "Do you have a preferred PCB manufacturer, or should we select one?",
      "raised_by": "admin",
      "raised_at": "2026-09-05T11:00:05Z",
      "status": "awaiting_response",
      "response": null
    }
  ],
  "request_id": "..."
}
```
Each item is independently resolvable, matching Document 03 §26's "answer Question 1 now, Question 2 later."

### MFG-API-006 — POST /api/v1/manufacturing/requests/{request_id}/clarifications/{clarification_id}/respond

**Request Body:** `{"text": "5V USB power.", "attached_file_ids": []}`.
**Validation:** `text` required (Document 03 §26, "cannot submit an empty response"), non-empty after trim.
**Business Rules:** sets `status: resolved` on this clarification item; if this was the last open item on the request, the request itself transitions `clarification_needed → under_review` (or `→ requirements_confirmed`, per admin's prior context) automatically; triggers a notification to the reviewing admin (not a customer-facing notification, since the customer is the actor here).
**Status Codes:** `200`; `409` already resolved; `404` not found/not owned.
**Idempotency:** re-submitting a response to an already-resolved question is rejected (`409`) rather than silently overwriting, preserving the response history for audit purposes — an admin needing a correction raises a new clarification question instead.

The equivalent **admin-side** endpoint for raising a question is `ADMIN-MFG-API-004` (Section 43).

---

## 24. Service Request APIs — Architectural Decision

**Decision: a shared underlying service-request architecture, exposed as domain-specific endpoint namespaces.**

Document 02, Section 6/8 establishes that Manufacturing, Consultation, Design, and Software share a common base implementation internally (a generic "service request" pattern) while remaining separate modules for role/field distinctness. The API mirrors this exactly: **the request/status/clarification/quote/file mechanics are structurally identical across all four** (same state-machine shape, same clarification pattern, same quote-approval gate), but each is exposed under its own path prefix (`/api/v1/manufacturing/requests`, `/api/v1/consultations`, `/api/v1/design/requests`, `/api/v1/software/requests`) rather than a single generic `/api/v1/service-requests?type=...` resource.

**Why domain-specific paths rather than one generic endpoint:** Document 03 (Sections 29–31) gives each service its own distinct request-form field set (Design's form has no Quantity/Dimensions; Software's has a Platform/Technology field none of the others have; Consultation's is a single-section form) and its own landing/detail screens. A single generic endpoint would force the client to send a discriminated-union payload and would blur the module-ownership boundaries Document 02 deliberately keeps separate (e.g., `MANUFACTURING_MANAGER`'s RBAC scope is `manufacturing:*, design:*, software:*` as one grouped permission, but Consultation could plausibly evolve independent access rules later — keeping the paths separate preserves that flexibility without a V1 cost). Domain-specific paths also produce a clearer, more directly traceable OpenAPI schema per module (Section 74), consistent with "every API must map to a product requirement" being easiest to audit when the URL itself names the domain.

**What this means concretely:** Sections 25–27 below define each service's endpoints using the *exact same shape* as Section 21/22/23 (Manufacturing), differing only in the request-body fields (per Document 03's form specs) — rather than re-deriving the state machine, clarification pattern, and cancellation rules from scratch for each, since Document 01 defines them identically (DESIGN-001, SW-001 explicitly mirror MFG-001).

---

## 25. Consultation APIs

Base: `/api/v1/consultations/`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| CONSULT-API-001 | POST | `/api/v1/consultations` | Submit a consultation request |
| CONSULT-API-002 | GET | `/api/v1/consultations` | List own consultations |
| CONSULT-API-003 | GET | `/api/v1/consultations/{id}` | Detail |
| CONSULT-API-004 | POST | `/api/v1/consultations/{id}/resolve` | Customer marks their own consultation resolved (Document 03 §30) |
| CONSULT-API-005 | GET | `/api/v1/consultations/{id}/clarifications` | Discussion thread (same shape as MFG-API-005) |
| CONSULT-API-006 | POST | `/api/v1/consultations/{id}/clarifications/{clarification_id}/respond` | Same shape as MFG-API-006 |

**CONSULT-API-001 request:** `{"topic": "Choosing a microcontroller for a battery-powered sensor", "description": "I'm building a...", "file_ids": []}` — the single-section form per Document 03 §30, deliberately simpler than Manufacturing's.
**States:** `submitted → in_progress → responded → completed` or `→ closed` (inactivity, Document 02 §19's scheduled check) — no quote/payment states unless converted (below).
**Conversion:** `ADMIN-CONSULT-API-002` (Section 45) converts a consultation into a quoted engagement, which creates a `Quote` linked to this `ConsultationRequest` — from that point, `CONSULT-API-003`'s response includes a `converted_quote_id`, and Section 32's Quote APIs take over the pricing/approval flow while the consultation record itself remains as historical context (Document 03 §30).

---

## 26. Design / PCB APIs

Base: `/api/v1/design/requests/`. Identical shape to Manufacturing (Section 21/22/23) with a narrower request body per Document 03 §29.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| DESIGN-API-001 | POST | `/api/v1/design/requests` | Submit a design/PCB request |
| DESIGN-API-002 | GET | `/api/v1/design/requests` | List own requests |
| DESIGN-API-003 | GET | `/api/v1/design/requests/{id}` | Detail |
| DESIGN-API-004 | POST | `/api/v1/design/requests/{id}/cancel` | Cancel (DESIGN-001 mirrors MFG-004/005/006) |
| DESIGN-API-005 | GET/POST | `/api/v1/design/requests/{id}/clarifications[/...]` | Same shape as MFG-API-005/006 |
| DESIGN-API-006 | POST | `/api/v1/design/requests/{id}/start-manufacturing` | Convenience action implementing Document 03 §29's "Start a Manufacturing Request using these files" — creates a **draft** `MFG-API-001` payload pre-filled with this design request's delivered `file_ids`, returned to the client to review/complete before actual submission (does not itself create the Manufacturing request, avoiding a surprise auto-submission) |

**DESIGN-API-001 request:** `{"title": "...", "project_overview": "...", "design_scope": "pcb_layout", "reference_file_ids": [...], "additional_notes": "..."}` — note the absence of Quantity/Dimensions/Materials/Manufacturing Requirements fields, matching Document 03 §29's narrower form.
**States:** identical set to Section 22, with `quote_ready`→`payment_pending`→`in_progress`→`completed_execution`→(no physical shipment step unless the design also has a physical prototype deliverable, in which case `ADMIN-SHIP-API-002` applies)→`delivered`→`completed`.

---

## 27. Software / Firmware APIs

Base: `/api/v1/software/requests/`. Identical shape again.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| SW-API-001 | POST | `/api/v1/software/requests` | Submit a software/firmware request |
| SW-API-002 | GET | `/api/v1/software/requests` | List own requests |
| SW-API-003 | GET | `/api/v1/software/requests/{id}` | Detail |
| SW-API-004 | POST | `/api/v1/software/requests/{id}/cancel` | Cancel (SW-001 mirrors MFG rules) |
| SW-API-005 | GET/POST | `/api/v1/software/requests/{id}/clarifications[/...]` | Same shape |

**SW-API-001 request:** `{"title": "...", "project_description": "...", "requirements": "...", "platform_technology": "ESP32 / Arduino IDE", "reference_file_ids": [...], "additional_notes": "..."}` per Document 03 §31. No physical shipment step ever applies to this request type (deliverables are always files).

---

## 28. Project APIs

Base: `/api/v1/projects/`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| PROJECT-API-001 | GET | `/api/v1/projects` | List the customer's projects |
| PROJECT-API-002 | POST | `/api/v1/projects` | Create a project (name only) |
| PROJECT-API-003 | GET | `/api/v1/projects/{id}` | Project detail with linked requests |
| PROJECT-API-004 | PATCH | `/api/v1/projects/{id}` | Rename |
| PROJECT-API-005 | POST | `/api/v1/projects/{id}/link` | Link an existing request (any type) to this project |
| PROJECT-API-006 | POST | `/api/v1/projects/{id}/unlink` | Unlink |
| PROJECT-API-007 | GET | `/api/v1/projects/{id}/files` | Aggregated file list across every linked request (Document 03 §32) |

**PROJECT-API-002 request:** `{"name": "Home Energy Monitor v2"}` — no other fields, matching Document 02's "lightweight grouping" resolution and Document 03 §32's minimal creation form.
**PROJECT-API-005 request:** `{"request_type": "manufacturing", "request_id": "req-uuid"}` — `request_type` is one of `manufacturing|design|consultation|software`; the referenced request must be owned by the caller.
**PROJECT-API-003 response:** `{"data": {"id": "...", "name": "...", "linked_requests": [{"type": "design", "id": "...", "status": "completed", "title": "..."}, {"type": "manufacturing", "id": "...", "status": "in_progress", "title": "..."}]}, "request_id": "..."}`.

No standalone `/timeline` endpoint is created beyond what Section 21's per-request `/history` already provides — a project-level timeline (Document 03 §32) is composed client-side from the linked requests' individual histories, since Document 01/02 do not define a merged cross-request event log as its own entity.

---

## 29. File API

Base: `/api/v1/files/`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| FILES-API-001 | POST | `/api/v1/files` | Upload a file (multipart), associated with a request |
| FILES-API-002 | GET | `/api/v1/files/{file_id}` | File metadata |
| FILES-API-003 | GET | `/api/v1/files/{file_id}/download` | Obtain a short-lived signed download URL |
| FILES-API-004 | DELETE | `/api/v1/files/{file_id}` | Delete (customer-owned files only) |

### FILES-API-001 — POST /api/v1/files

**Request:** `multipart/form-data` with fields `file` (binary), `association_type` (`manufacturing|design|consultation|software`), `association_id` (the request UUID — may be a not-yet-created request in the case of the initial request-submission form, in which case the client uploads files *before* calling e.g. `MFG-API-001` and passes the returned `file_ids` in that call, per Section 21's contract — FILE-002 still holds because the association is finalized at request-creation time even though the byte upload happens first).
**Validation:** MIME type allow-list (image, PDF, common CAD formats — STL/STEP/DXF, ZIP), max size (100MB per Document 02 §16/37's proposed default), declared type checked against actual file signature bytes.
**Business Rules:** creates the `ProjectFile` metadata row in `pending_scan` status immediately; the actual bytes are uploaded to Cloudinary synchronously within this request (private-delivery mode); a Celery task is enqueued for malware scanning (Document 02 §16).
**Response (201):**
```json
{
  "data": {"id": "file-uuid", "filename": "schematic_v1.pdf", "content_type": "application/pdf", "size_bytes": 245678, "scan_status": "pending_scan", "created_at": "..."},
  "request_id": "..."
}
```
**Status Codes:** `201`; `400` unsupported type or size exceeded (`FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`); `413` if the size limit is enforced at the transport layer.
**Side Effects:** enqueues malware scan (async, Document 02 §16); the file is **not downloadable** (`FILES-API-003` returns `409`) until `scan_status` reaches `clean`.

### FILES-API-003 — GET /api/v1/files/{file_id}/download

**Authorization:** the requester must be the owning customer or an admin whose role covers the associated request's type (FILE-001/004, Section 30).
**Business Rules:** returns a Cloudinary signed URL with a short expiry (e.g., 5 minutes) generated fresh on every call — never a cached/permanent URL.
**Response (200):** `{"data": {"download_url": "https://res.cloudinary.com/...&signature=...&expires=...", "expires_in": 300}, "request_id": "..."}`.
**Status Codes:** `200`; `403` not authorized (a different customer's file — returns `404`, not `403`, per Section 59's IDOR-safe pattern); `409` `FILE_NOT_YET_AVAILABLE` (still `pending_scan`) or `410` `FILE_FLAGGED` (failed scan, permanently blocked).

---

## 30. Private File Access

```
Client
  │  GET /api/v1/files/{id}/download  (Bearer token)
  ▼
VenopAI Backend
  │  1. Resolve caller identity from JWT
  │  2. Load ProjectFile.owner_id + associated request's type
  │  3. Check: caller.id == owner_id  OR  caller.role covers that request type
  │  4. If authorized AND scan_status == clean → call CloudinaryProvider.get_signed_url(ref, expires_in=300)
  │  5. If not authorized → 404 (never confirm the file's existence to a non-owner)
  ▼
Signed, time-limited Cloudinary URL returned to client
  ▼
Client fetches the file directly from Cloudinary using that URL (bytes never proxy through VenopAI's own server, for efficiency — the signature is what enforces access, generated only after VenopAI's own authorization check)
```

**No unrestricted Cloudinary credentials are ever sent to any client** — the backend's Cloudinary API secret exists only in Render's server-side environment configuration (Document 02 §22); only the derived signed URL, valid for a few minutes and scoped to that one file, ever reaches a browser.

---

## 31. File Validation

| State | Meaning | Reachable From | Customer-Facing Behavior |
|---|---|---|---|
| `pending_scan` | Uploaded, awaiting malware scan | Upload (`FILES-API-001`) | FileUploader shows "Scanning…" (Document 03 §9) |
| `clean` | Passed scan, available for download | `pending_scan` | Fully available |
| `flagged` | Failed scan | `pending_scan` | Blocked, customer prompted to re-upload (Document 02 §16) |
| `rejected` | Failed upload-time validation (type/size) | (never persisted — rejected synchronously at `FILES-API-001`, no row created) | Immediate `400` response, no file entity ever exists |
| `failed` | Scan process itself errored (infrastructure issue, not a malware finding) | `pending_scan` | Treated the same as `flagged` from the customer's perspective (blocked, re-upload prompted) but distinguished internally for admin troubleshooting |

Unsupported type / size exceeded / invalid MIME are all synchronous `400` rejections at `FILES-API-001` and never produce a stored `ProjectFile` row (they are not a "state" of a file, since no file entity exists yet) — this is a deliberate simplification versus the source instructions' example list, since Document 02 §16 draws this same distinction between upload-time validation failure (no entity created) and post-upload scan failure (entity exists, then blocked).

---

## 32. Quote API

Base: `/api/v1/quotes/`. The single most rule-dense domain alongside Manufacturing.

**Customer-facing:**

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| QUOTE-API-001 | GET | `/api/v1/quotes` | List quotes across all the customer's requests |
| QUOTE-API-002 | GET | `/api/v1/quotes/{quote_id}` | Current (non-superseded) version's full detail |
| QUOTE-API-003 | GET | `/api/v1/quotes/{quote_id}/versions` | Version history list |
| QUOTE-API-004 | GET | `/api/v1/quotes/{quote_id}/versions/{version_id}` | A specific version's detail (including historical/superseded ones, read-only) |
| QUOTE-API-005 | POST | `/api/v1/quotes/{quote_id}/approve` | Approve the current version |
| QUOTE-API-006 | POST | `/api/v1/quotes/{quote_id}/reject` | Reject the current version |

**Admin-facing:** Section 44.

### QUOTE-API-002 — GET /api/v1/quotes/{quote_id}

**Response (200):**
```json
{
  "data": {
    "id": "quote-uuid",
    "request_type": "manufacturing",
    "request_id": "req-uuid",
    "current_version": {
      "version_number": 2,
      "status": "sent",
      "scope_summary": "Enclosure + PCB assembly, quantity 5, matte black finish",
      "line_items": [{"description": "PCB fabrication and assembly (x5)", "amount": "8500.00"}, {"description": "Enclosure manufacturing (x5)", "amount": "4200.00"}],
      "subtotal": "12700.00",
      "tax": {"type": "IGST", "amount": "2286.00"},
      "shipping_amount": "150.00",
      "total": "15136.00",
      "estimated_timeline": "10-14 business days after payment",
      "valid_until": "2026-09-12T23:59:59Z",
      "terms": "Full payment required before production begins...",
      "created_at": "2026-09-06T09:00:00Z"
    }
  },
  "request_id": "..."
}
```
**Status Codes:** `200`; `404` not found/not owned.

### QUOTE-API-005 — POST /api/v1/quotes/{quote_id}/approve

**Business Rules:** only valid when `current_version.status` is `sent` or `viewed`, and the version hasn't expired (QUOTE-001/002); on approval, `status → approved`, `QuoteApproval` record created; the associated request transitions `quote_ready → payment_pending` (Section 22); triggers notification (NOTIF-001 event "quote approved").
**Response (200):** updated quote.
**Status Codes:** `200`; `409` `QUOTE_EXPIRED` / `QUOTE_SUPERSEDED` / `QUOTE_ALREADY_ACTIONED`.
**Idempotency:** re-approving an already-`approved` quote returns `200` with the unchanged current state rather than erroring — a harmless no-op, since the customer's intent ("I approve this") is already satisfied.

### QUOTE-API-006 — POST /api/v1/quotes/{quote_id}/reject

**Request Body:** `{"reason": "Price is higher than expected"}` (optional).
**Business Rules:** `status → rejected`; associated request returns to `clarification_needed` (if the admin chooses to renegotiate — a subsequent `ADMIN-MFG-API-005` revision call creates a new version) or remains `rejected` if the customer/admin closes it out.
**Response (200):** updated quote.
**Status Codes:** `200`; `409` already actioned/expired.

---

## 33. Quote Versioning Contract

The single most critical contract in this document (QUOTE-003/004).

- **`QUOTE-API-002` always returns the current (latest, non-superseded) version** as `current_version` — there is no ambiguity about which version is "the" quote for approval/payment purposes.
- **`QUOTE-API-003` (version list)** returns every version in reverse-chronological order, each tagged with its own immutable `status` (`superseded`, `approved`, `rejected`, `expired`, or — only for the single current one — `draft`/`sent`/`viewed`/`approved`/`rejected`/`expired`).
- **`QUOTE-API-004` (specific version detail)** is **read-only for every version** — there is no endpoint that accepts a body to modify a `QuoteVersion` after creation, anywhere in the API, for any role. The only way a quote's terms change is `ADMIN-QUOTE-API-003` (revise), which **creates an entirely new version row** and atomically marks the previous one `superseded` in one transaction (Document 02 §11) — never an in-place edit.
- **`QUOTE-API-005`/`006` (approve/reject) only operate on the current version** — calling them with a `quote_id` whose current version differs from what the client last fetched (e.g., the client's cached copy is now superseded) returns `409 QUOTE_SUPERSEDED` with the fresh current version embedded in the error response, so the client can immediately show the customer the up-to-date quote rather than requiring a second round-trip.
- **An approved-and-paid version is permanently locked**: once `Payment` reaches `successful` against a given `QuoteVersion`, that version can never be superseded by a simple revision — any further scope change (Document 01 §10's "requirement change after payment") goes through the admin cancellation/renegotiation review path (Section 21's admin cancellation-review queue), not a normal `ADMIN-QUOTE-API-003` call, since silently creating a new version against an already-paid engagement would violate QUOTE-003's spirit even if not its literal wording about pre-payment quotes. This distinction is called out explicitly as it is not stated in so many words in Document 01, but follows necessarily from combining QUOTE-003 with MFG-003 (in-progress requirement changes require admin review first).

---

## 34. Quote State Contract

| State | Meaning | Who Triggers | Next States | Permission to Trigger |
|---|---|---|---|---|
| `draft` | Being composed by an admin, not yet visible to customer | Admin | `sent`, `cancelled` | `MANUFACTURING_MANAGER`/`SUPER_ADMIN` |
| `sent` | Delivered to customer | Admin (send action) | `viewed`, `expired`, `superseded` | System (auto on customer view →`viewed`), Admin (revise →`superseded` on the old one) |
| `viewed` | Customer has opened it | System (auto) | `approved`, `rejected`, `expired`, `superseded` | Customer (approve/reject) |
| `approved` | Customer accepted; unlocks payment | Customer | (locked — see Section 33) | — |
| `rejected` | Customer declined | Customer | `superseded` (if revised for renegotiation) | Admin (revise) |
| `expired` | Validity window passed unactioned | System (scheduled job, Doc 02 §19) | `superseded` (if a fresh quote is issued) | Admin (revise/re-issue) |
| `superseded` | A newer version now exists | System (on revision) | (terminal for this version) | — |
| `cancelled` | Withdrawn before being actioned | Admin or Customer (request-level cancellation cascades here) | (terminal) | Either |

Only `draft`, `sent`, or `viewed` versions can transition to `superseded` (a version already `approved` cannot be superseded by an ordinary revision, per Section 33's lock rule).

---

## 35. Review API

Base: `/api/v1/reviews/`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| REVIEW-API-001 | POST | `/api/v1/reviews` | Submit a review |
| REVIEW-API-002 | GET | `/api/v1/reviews/mine` | The customer's own reviews |
| REVIEW-API-003 | PATCH | `/api/v1/reviews/{review_id}` | Edit (within the permitted window) |
| REVIEW-API-004 | DELETE | `/api/v1/reviews/{review_id}` | Delete (within the permitted window) |
| REVIEW-API-005 | GET | `/api/v1/products/{product_id}/reviews` | Public reviews for a product |

**REVIEW-API-001 request:** `{"target_type": "order_item", "target_id": "order-item-uuid", "rating": 5, "text": "Worked perfectly for my project."}` or `{"target_type": "manufacturing_request", "target_id": "req-uuid", "rating": 4, "text": "..."}`.
**Business Rules:** `target_type: order_item` requires that `OrderItem`'s parent `Order.status == delivered` (or later); `target_type` of any service-request kind requires that request's `status == completed` (REV-001/002); one review per (`current_user`, `target`) pair — a duplicate submission returns `409 REVIEW_ALREADY_EXISTS` (pointing to `REVIEW-API-003` for editing instead).
**Response (201):** the created review.
**Status Codes:** `201`; `403` `NOT_ELIGIBLE` (no qualifying delivered order/completed request); `409` duplicate.
**REVIEW-API-005 response:** only `visible` (non-moderated) reviews, plus an `average_rating`/`review_count` summary — moderated (`hidden`) reviews never appear here regardless of caller (public endpoint).

---

## 36. Notification API

Per NOTIF-001 (email-only) and Document 03 §34's explicit "send-history log, not an inbox" design — this is the smallest domain in the API by design.

### NOTIF-API-001 — GET /api/v1/notifications

**Purpose:** the customer's own notification send-history (Document 03 §34).
**Query Parameters:** `page`, `page_size`.
**Response (200):** `{"data": [{"id": "...", "event_type": "order_confirmation", "subject": "Your VenopAI order is confirmed", "sent_at": "...", "status": "sent"}], "request_id": "..."}`.
**No mark-as-read, no delete, no push-subscription endpoints exist** — consistent with Document 03's explicit scope boundary; this is the only endpoint in the domain.

---

## 37. Admin API Architecture

Every endpoint under `/api/v1/admin/` requires a valid admin JWT (distinct token audience, Document 02 §20) **and** passes a permission check specific to that endpoint (Document 02 §21) before any service logic runs — enforced identically for every admin endpoint in this document via a shared `require_permission("<resource>:<action>")` dependency, never left to the frontend to gate (Document 03 §21/Document 02 §21's restated "hidden button is not authorization").

The full permission matrix is in Section 58.

---

## 38. Admin Dashboard API

### ADMIN-DASH-API-001 — GET /api/v1/admin/dashboard

**Purpose:** power the role-scoped Admin Dashboard (Document 03 §37) with one coherent resource rather than many scattered metric endpoints (per the explicit instruction to avoid endpoint sprawl here).
**Authorization:** any admin role — response content is filtered server-side to only the queues/metrics that role's permissions cover.
**Response (200), example for a `MANUFACTURING_MANAGER`:**
```json
{
  "data": {
    "queues": {
      "new_requests_awaiting_review": [{"id": "...", "type": "manufacturing", "title": "...", "submitted_at": "..."}],
      "requests_in_clarification": [...],
      "quotes_awaiting_customer_response": [...]
    },
    "headline_metrics": {"open_requests": 14, "requests_older_than_3_days": 3}
  },
  "request_id": "..."
}
```
For `ORDER_MANAGER`: `queues.new_orders`, `queues.shipping_exceptions`, `queues.low_stock_alerts`. For `FINANCE_MANAGER`: `queues.pending_payment_verifications`, `queues.refunds_to_process`. For `SUPPORT_EXECUTIVE`: `queues.flagged_reviews`. `SUPER_ADMIN` receives the union of all of the above under one response.
**Status Codes:** `200`.

---

## 39. Admin Customer APIs

Base: `/api/v1/admin/customers/`. Scoped to `SUPPORT_EXECUTIVE`, `SUPER_ADMIN` (read); other roles may read a customer only in the context of a specific order/request they're handling (enforced via the resource-specific endpoints, not this listing endpoint).

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-CUST-API-001 | GET | `/api/v1/admin/customers` | List/search customers |
| ADMIN-CUST-API-002 | GET | `/api/v1/admin/customers/{customer_id}` | Customer detail (profile, account status) |
| ADMIN-CUST-API-003 | GET | `/api/v1/admin/customers/{customer_id}/orders` | That customer's orders |
| ADMIN-CUST-API-004 | GET | `/api/v1/admin/customers/{customer_id}/requests` | That customer's service requests (all types) |
| ADMIN-CUST-API-005 | GET | `/api/v1/admin/customers/{customer_id}/projects` | That customer's projects |
| ADMIN-CUST-API-006 | POST | `/api/v1/admin/customers/{customer_id}/deactivate` | Deactivate an account (`SUPER_ADMIN` only) |

---

## 40. Admin Catalog APIs

Base: `/api/v1/admin/products/`, `/api/v1/admin/categories/`. Scoped to `ORDER_MANAGER`, `SUPER_ADMIN`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-CAT-API-001 | GET | `/api/v1/admin/products` | List including inactive/draft products |
| ADMIN-CAT-API-002 | POST | `/api/v1/admin/products` | Create a product |
| ADMIN-CAT-API-003 | PATCH | `/api/v1/admin/products/{id}` | Update (including status transitions) |
| ADMIN-CAT-API-004 | POST | `/api/v1/admin/products/{id}/images` | Upload a public media image (Cloudinary public path, Document 02 §16) |
| ADMIN-CAT-API-005 | GET | `/api/v1/admin/categories` | List (admin view, includes hidden) |
| ADMIN-CAT-API-006 | POST | `/api/v1/admin/categories` | Create (max two-level nesting enforced, CAT-010/011) |
| ADMIN-CAT-API-007 | PATCH | `/api/v1/admin/categories/{id}` | Edit/hide |

**ADMIN-CAT-API-002 request:** `{"name": "Arduino Uno R3", "description": "...", "specifications": [{"key": "Operating Voltage", "value": "5V"}], "price": "1499.00", "category_ids": ["cat-uuid"], "status": "draft"}`.
**Business Rules:** `status` starts `draft`; must be explicitly set to `active` via `ADMIN-CAT-API-003` to become publicly visible (CAT-001) — no product is public immediately on creation, giving admins a review step.

---

## 41. Admin Inventory APIs

Covered fully in Section 12 (`ADMIN-INV-API-001` through `004`) — not duplicated here to avoid the redundant-endpoint anti-pattern the instructions warn against.

---

## 42. Admin Order APIs

Base: `/api/v1/admin/orders/`. Scoped to `ORDER_MANAGER`, `SUPER_ADMIN` (read access also granted to `SUPPORT_EXECUTIVE` per Document 01 §20).

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-ORD-API-001 | GET | `/api/v1/admin/orders` | List/search/filter all orders |
| ADMIN-ORD-API-002 | GET | `/api/v1/admin/orders/{order_id}` | Full detail incl. internal notes |
| ADMIN-ORD-API-003 | PATCH | `/api/v1/admin/orders/{order_id}/status` | Advance status (`processing`→`ready_to_ship`) |
| ADMIN-ORD-API-004 | POST | `/api/v1/admin/orders/{order_id}/notes` | Add an internal note |
| ADMIN-ORD-API-005 | POST | `/api/v1/admin/orders/{order_id}/flag-cancellation` | Flag for `FINANCE_MANAGER` refund review (Document 03 §39's role handoff) |

**ADMIN-ORD-API-003 request:** `{"status": "ready_to_ship"}` — validated against Section 15's transition table; an invalid transition (e.g., `processing → delivered`) returns `409 INVALID_STATE_TRANSITION`.
**Authorization:** `ORDER_MANAGER`/`SUPER_ADMIN` only — `SUPPORT_EXECUTIVE` can read (`ADMIN-ORD-API-001/002`) but not write.

Shipment creation is `ADMIN-SHIP-API-001` (Section 19); refund is `PAYMENT-API-005` (Section 16, `FINANCE_MANAGER`-only) — deliberately not duplicated under `/admin/orders/` to keep each action owned by exactly one domain's endpoint set, matching Document 02's module-ownership principle.

---

## 43. Admin Manufacturing APIs

Base: `/api/v1/admin/manufacturing/requests/`. Scoped to `MANUFACTURING_MANAGER`, `SUPER_ADMIN`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-MFG-API-001 | GET | `/api/v1/admin/manufacturing/requests` | Queue view (filterable, sortable by age — Document 03 §41) |
| ADMIN-MFG-API-002 | GET | `/api/v1/admin/manufacturing/requests/{id}` | Full detail incl. internal notes |
| ADMIN-MFG-API-003 | POST | `/api/v1/admin/manufacturing/requests/{id}/confirm-requirements` | `under_review → requirements_confirmed` |
| ADMIN-MFG-API-004 | POST | `/api/v1/admin/manufacturing/requests/{id}/clarifications` | Raise a new clarification question |
| ADMIN-MFG-API-005 | POST | `/api/v1/admin/manufacturing/requests/{id}/status-update` | Post a plain-language execution status note (Document 03 §23/§41) |
| ADMIN-MFG-API-006 | POST | `/api/v1/admin/manufacturing/requests/{id}/complete-execution` | `in_progress → completed_execution` |
| ADMIN-MFG-API-007 | POST | `/api/v1/admin/manufacturing/requests/{id}/complete` | `delivered → completed` |
| ADMIN-MFG-API-008 | GET | `/api/v1/admin/manufacturing/cancellation-review-queue` | Requests with `cancellation_requested: true` (Section 21) |
| ADMIN-MFG-API-009 | POST | `/api/v1/admin/manufacturing/requests/{id}/resolve-cancellation` | Approve (with refund terms) or decline a post-execution cancellation request |

**ADMIN-MFG-API-004 request:** `{"question": "Do you have a preferred PCB manufacturer, or should we select one?"}` — creates the customer-visible clarification item consumed by `MFG-API-005/006`.
**ADMIN-MFG-API-009 request:** `{"decision": "approve", "refund_amount": "5000.00", "notes": "Partial refund per quote terms — materials already ordered"}` or `{"decision": "decline", "notes": "..."}`.

Quote creation/revision for a Manufacturing request is handled by Section 44's Admin Quote APIs (shared across all four service types, per Section 24's architecture decision) rather than nested under `/admin/manufacturing/` — avoiding duplicating the quote-creation contract four times.

Design and Software have an identical admin endpoint set under `/api/v1/admin/design/requests/` and `/api/v1/admin/software/requests/`; Consultation's equivalent is Section 45's `ADMIN-CONSULT-API-*` set (narrower, since Consultation lacks execution/shipping stages).

---

## 44. Admin Quote APIs

Base: `/api/v1/admin/quotes/`. Scoped to `MANUFACTURING_MANAGER`, `SUPER_ADMIN`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-QUOTE-API-001 | POST | `/api/v1/admin/quotes` | Create a new quote (as `draft`) against a request |
| ADMIN-QUOTE-API-002 | PATCH | `/api/v1/admin/quotes/{quote_id}/draft` | Edit an unsent `draft` version in place (the only mutation allowed on a version, since it hasn't been sent/seen yet) |
| ADMIN-QUOTE-API-003 | POST | `/api/v1/admin/quotes/{quote_id}/send` | `draft → sent`, notifies customer |
| ADMIN-QUOTE-API-004 | POST | `/api/v1/admin/quotes/{quote_id}/revise` | Create a new version, superseding the current one (Section 33) |
| ADMIN-QUOTE-API-005 | GET | `/api/v1/admin/quotes/{quote_id}/approvals` | Full approval/rejection history across all versions |
| ADMIN-QUOTE-API-006 | POST | `/api/v1/admin/quotes/{quote_id}/cancel` | Cancel a pre-approval quote |

**ADMIN-QUOTE-API-001 request:**
```json
{
  "request_type": "manufacturing",
  "request_id": "req-uuid",
  "line_items": [{"description": "PCB fabrication and assembly (x5)", "amount": "8500.00"}],
  "shipping_amount": "150.00",
  "estimated_timeline": "10-14 business days after payment",
  "valid_until": "2026-09-19T23:59:59Z",
  "terms": "Full payment required before production begins..."
}
```
**Business Rules:** `tax` is server-computed from `line_items` + the associated request's customer address (TAX-002), never client-supplied; creates `Quote` + its first `QuoteVersion` (`version_number: 1`, `status: draft`) atomically.

**ADMIN-QUOTE-API-004 (revise) business rules:** callable on a quote whose current version is any of `sent, viewed, rejected, expired` (Section 34) — **never** on an `approved` (and especially never on a `paid`) version (Section 33's lock rule) — attempting so returns `409 QUOTE_LOCKED_POST_APPROVAL`, directing the admin to the cancellation-review flow (`ADMIN-MFG-API-008/009`) instead. Creates `version_number + 1` as a new row, marks the prior `status: superseded`, resets the associated request's status back to `quote_ready` (or leaves it in `clarification_needed` if that's where the revision originated) — all in one transaction (Document 02 §11).

---

## 45. Admin Service APIs

**Consultation** (`/api/v1/admin/consultations/`):

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-CONSULT-API-001 | GET/GET-by-id | `/api/v1/admin/consultations[/{id}]` | Queue/detail |
| ADMIN-CONSULT-API-002 | POST | `/api/v1/admin/consultations/{id}/convert-to-quote` | Converts to a billable engagement — creates a `Quote` linked to this consultation, entering the same Section 44 quote flow |
| ADMIN-CONSULT-API-003 | POST | `/api/v1/admin/consultations/{id}/respond` | Post a response (the admin-side of `CONSULT-API-005/006`'s thread) |
| ADMIN-CONSULT-API-004 | POST | `/api/v1/admin/consultations/{id}/close` | Mark `closed` (inactivity or admin decision) |

**Design and Software admin endpoints:** as noted in Section 43, mirror `ADMIN-MFG-API-001–007` exactly under their own path prefixes (`/api/v1/admin/design/requests/...`, `/api/v1/admin/software/requests/...`) — omitted here in full to avoid restating an identical table three times; the shape, business rules, and status contract are byte-for-byte the same as Section 43 with the domain name substituted, per Section 24's architectural decision.

---

## 46. Admin File APIs

Base: `/api/v1/admin/files/`. Access is **not** blanket-granted to every admin role (per the explicit instruction) — it is derived from the same rule as customer access (Section 30), substituting "owning customer" with "the admin's role covers this request's type."

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-FILES-API-001 | GET | `/api/v1/admin/requests/{request_type}/{request_id}/files` | List files for a request the caller's role covers |
| ADMIN-FILES-API-002 | POST | `/api/v1/admin/requests/{request_type}/{request_id}/deliverables` | Upload a deliverable file (marked `team_deliverable`, distinct from customer uploads per Document 03 §43) |
| ADMIN-FILES-API-003 | GET | `/api/v1/admin/files/{file_id}/download` | Same signed-URL mechanism as `FILES-API-003`, gated by role-covers-request-type instead of ownership |

`SUPPORT_EXECUTIVE`, `ORDER_MANAGER`, and `FINANCE_MANAGER` have **no** access to `ADMIN-FILES-API-*` for Manufacturing/Design/Software/Consultation files (those domains are outside their role scope, Document 02 §21) — only `MANUFACTURING_MANAGER` and `SUPER_ADMIN` can call these endpoints, directly implementing "do not give every admin role unrestricted access to all project files."

---

## 47. Admin Review APIs

Base: `/api/v1/admin/reviews/`. Scoped to `SUPPORT_EXECUTIVE`, `SUPER_ADMIN`.

| ID | Method | Endpoint | Purpose |
|---|---|---|---|
| ADMIN-REVIEW-API-001 | GET | `/api/v1/admin/reviews` | Moderation queue/list |
| ADMIN-REVIEW-API-002 | POST | `/api/v1/admin/reviews/{id}/hide` | Hide (requires `reason`) |
| ADMIN-REVIEW-API-003 | POST | `/api/v1/admin/reviews/{id}/restore` | Restore visibility |

**Business Rules:** never deletes the underlying record (REV-003) — `hide`/`restore` toggle a `visibility` field only; both actions write an `AuditEvent`.

---

## 48. Admin Analytics APIs

### ADMIN-ANALYTICS-API-001 — GET /api/v1/admin/analytics

**Purpose:** one coherent, query-parameterized resource rather than a proliferation of single-metric endpoints (per the explicit instruction to avoid redundancy).
**Query Parameters:** `report` (one of: `orders`, `revenue`, `inventory`, `manufacturing_pipeline`, `quote_conversion`, `service_requests`, `customers`, `payments`, `shipping`), `date_from`, `date_to`, `group_by` (`day`/`week`/`month`, where applicable).
**Authorization:** the `report` value is itself permission-gated — `FINANCE_MANAGER` may request `revenue`/`payments`, `ORDER_MANAGER` may request `orders`/`inventory`/`shipping`, `MANUFACTURING_MANAGER` may request `manufacturing_pipeline`/`quote_conversion`/`service_requests`, `SUPER_ADMIN` may request any; requesting an out-of-scope report returns `403`.
**Response (200), example `report=quote_conversion`:**
```json
{
  "data": {
    "report": "quote_conversion",
    "period": {"from": "2026-08-01", "to": "2026-09-01"},
    "sent": 42, "approved": 27, "rejected": 6, "expired": 5, "pending": 4,
    "conversion_rate": 0.643
  },
  "request_id": "..."
}
```
**Status Codes:** `200`; `403` report outside role scope; `400` invalid `report` value.

### ADMIN-ANALYTICS-API-002 — GET /api/v1/admin/analytics/export

**Purpose:** the CSV-export convenience noted as a controlled UX assumption (Document 03, Section 55) — same `report`/date parameters as above, response `Content-Type: text/csv`, limited to Orders, Payments, and Manufacturing/Service-request reports per that document's proposed default scope.

---

## 49. Admin Audit API

### ADMIN-AUDIT-API-001 — GET /api/v1/admin/audit-logs

**Purpose:** query the immutable audit trail (Document 01 §23, AUDIT-001/002).
**Authorization:** `SUPER_ADMIN` sees all entries; other roles see only entries where `actor_id == current_admin.id` (their own action history) — enforced server-side, not by hiding a filter client-side.
**Query Parameters:** `actor_id`, `action` (e.g., `order.status_changed`, `quote.revised`, `inventory.adjusted`), `resource_type`, `resource_id`, `date_from`, `date_to`, `page`, `page_size`.
**Response (200):** `{"data": [{"id": "...", "actor": {"id": "...", "name": "...", "role": "..."} | "system", "action": "quote.revised", "resource_type": "quote", "resource_id": "...", "details": {"from_version": 1, "to_version": 2}, "occurred_at": "..."}], "pagination": {...}, "request_id": "..."}`.
**Immutability:** no `PATCH`/`DELETE` exists for this resource anywhere in the API, for any role, ever (AUDIT-001).

---

## 50. API Request Schemas

Consolidated reference for the most important request bodies not already fully shown inline above (avoiding duplication of what Sections 6–49 already specify verbatim).

**AddressCreate:**
| Field | Type | Required | Validation |
|---|---|---|---|
| recipient_name | string | Yes | 2–100 chars |
| phone | string | Yes | Valid Indian mobile format |
| line1 | string | Yes | 1–200 chars |
| line2 | string | No | 0–200 chars |
| city | string | Yes | 1–100 chars |
| state | string | Yes | Must be a valid Indian state/UT |
| pincode | string | Yes | 6-digit format |
| is_default | boolean | No | Defaults `false` |

**CreateManufacturingRequest:** (full field table already given in Section 21's example; repeated here per the source instructions' explicit example, confirmed consistent)
| Field | Type | Required |
|---|---|---|
| title | string | Yes |
| project_overview | string | Yes |
| prototype_type | enum | Yes |
| quantity | integer (>=1) | Yes |
| technical_requirements | string | No |
| dimensions | object | No |
| materials | string | No |
| pcb_hardware_details | string | No |
| manufacturing_requirements | string | No |
| delivery_requirements | string | No |
| additional_notes | string | No |
| file_ids | array[uuid] | No |
| project_id | uuid \| null | No |

**CreateQuote (admin):** as shown in Section 44 — `request_type`, `request_id`, `line_items[]`, `shipping_amount`, `estimated_timeline`, `valid_until`, `terms`, all required except `shipping_amount` (omitted for non-physical services).

**CartItemCreate:** `product_id` (uuid, required), `quantity` (integer >=1, required).

**PaymentInitiate:** `source_type` (enum: `checkout_session`|`quote`, required), `source_id` (uuid, required).

No request schema defined anywhere in this document accepts a client-supplied `id`, `status`, `created_at`, computed price/tax total, or `available_quantity` — every such field is always server-computed or server-assigned, closing off an entire class of trust-the-client vulnerabilities by construction.

---

## 51. API Response Schemas

Consistent base shape for every major resource — `id`, `created_at`, `updated_at` always present where the entity supports updates; every collection response wraps items in `data` + `pagination`; every single-resource response wraps in `data`.

| Resource | Key Fields (beyond id/timestamps) |
|---|---|
| User | email, full_name, phone, status |
| Product | name, description, specifications[], price, currency, stock_status, category_ids[], image_urls[] |
| Category | name, parent_id (nullable), is_visible |
| Cart | items[], subtotal, currency |
| CartItem | product_id, name, unit_price, quantity, line_total, stock_warning |
| Order | order_number, status, payment_status, items[], subtotal, shipping_amount, tax, total, shipping_address, shipment, estimated_delivery |
| OrderItem | product_id, name, unit_price, quantity, line_total (all snapshotted, Document 02 §13) |
| Payment | status, amount, currency, linked_order_id \| linked_quote_id, gateway_reference (opaque), confirmed_at |
| Shipment | carrier, tracking_number, status, estimated_delivery, events[] |
| ManufacturingRequest / DesignRequest / SoftwareRequest / ConsultationRequest | title, status, submitted fields (per Section 21/25/26/27), files{customer_uploaded[], delivered[]}, current_quote (summary), project_id |
| Project | name, linked_requests[] |
| File (ProjectFile) | filename, content_type, size_bytes, scan_status, association{type, id}, uploaded_by (`customer`\|`admin`) |
| Quote | request_type, request_id, current_version{...} |
| QuoteVersion | version_number, status, line_items[], subtotal, tax, shipping_amount, total, estimated_timeline, valid_until, terms |
| Review | target_type, target_id, rating, text, visibility, created_at |
| Notification | event_type, subject, sent_at, status |

---

## 52. Pagination Contract

**Strategy: page-based (offset) pagination, consistently, everywhere** — no cursor-based pagination anywhere in V1, matching Document 03 §7's explicit page-based UX decision and avoiding two competing patterns in the same API.

- **Parameters:** `page` (1-indexed, default `1`), `page_size` (default `24` for product/catalog-style lists per typical grid density, default `20` for all other list endpoints, configurable per-request up to a maximum).
- **Maximum `page_size`:** `100` for any endpoint — a request above this is clamped, not rejected, to avoid breaking a client with an overly ambitious value.
- **Response metadata:** every paginated response includes a `pagination` object: `{"page": 1, "page_size": 24, "total_items": 132, "total_pages": 6}`.
- **Ordering:** every paginated collection has a well-defined default order (`created_at DESC` unless a domain-specific default is more useful, e.g., Products default to `newest` per Document 03 §13) so pagination is stable across pages even without an explicit `sort` parameter.

---

## 53. Filtering & Sorting Contract

- **Allowed filters are an explicit, per-resource allow-list** — no arbitrary/uncontrolled query field is ever accepted (an unrecognized query parameter is silently ignored, not treated as an error, to keep the API forgiving of client-side typos in optional parameters while still not executing arbitrary filter logic).
- **Products/Search:** `category`, `min_price`, `max_price`, `availability`, `search`(via the dedicated `q` param on the search endpoint, or omitted on the plain listing endpoint).
- **Orders:** `status`.
- **Manufacturing/Design/Software/Consultation requests (customer):** `status`.
- **Admin queues (Manufacturing/Orders/Quotes/etc.):** `status`, plus admin-only sort options like `oldest_first` (surfacing aging items, Document 03 §41).
- **Sorting parameter name:** always `sort`, with resource-specific allowed values documented per endpoint (Sections 8, 9, 14, etc.) — never a generic `sort_by`/`order_by` split into two parameters.
- **Reviews:** `rating` (exact or minimum, e.g., `?min_rating=4`).
- **Audit logs (admin only):** `actor_id`, `action`, `resource_type`, `resource_id`, `date_from`, `date_to`.

---

## 54. Error Contract

**One consistent envelope, used by every endpoint in this document without exception:**

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "The requested quantity is no longer available for one or more items.",
    "details": {"items": [{"product_id": "...", "requested": 3, "available": 1}]},
    "request_id": "b7e2-..."
  }
}
```

- **`code`:** a stable, machine-readable, SCREAMING_SNAKE_CASE identifier — never changes meaning once shipped (Section 75's versioning discipline extends to error codes).
- **`message`:** a safe, user-presentable (or at minimum developer-presentable) description — never a raw exception string or stack trace (Document 02 §25).
- **`details`:** optional, structured, endpoint-specific context (e.g., which line items failed) — omitted (`{}` or absent) when there's nothing structured to add.
- **`request_id`:** always present, matching the `request_id` that would have appeared in a successful response, for correlation with server-side logs/Sentry (Document 02 §24).

**Representative codes by category:**

| Category | Example Codes |
|---|---|
| Validation | `VALIDATION_ERROR`, `INVALID_QUANTITY`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE` |
| Authentication | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| Authorization | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `INSUFFICIENT_ROLE` |
| Not Found | `NOT_FOUND` (used uniformly rather than resource-specific 404 codes, since the message/context already disambiguates, and uniform 404 handling supports the IDOR-safe pattern in Section 59) |
| Conflict | `RESERVATION_EXPIRED`, `QUOTE_SUPERSEDED`, `QUOTE_NOT_APPROVED`, `QUOTE_ALREADY_ACTIONED`, `ORDER_NOT_CANCELLABLE`, `INVALID_STATE_TRANSITION`, `REVIEW_ALREADY_EXISTS`, `EMAIL_ALREADY_EXISTS` |
| Business Rule Violation | `INSUFFICIENT_STOCK`, `QUOTE_LOCKED_POST_APPROVAL`, `NOT_ELIGIBLE` (reviews) |
| External Provider Failure | `PAYMENT_PROVIDER_UNAVAILABLE`, `SHIPPING_PROVIDER_UNAVAILABLE` |
| Rate Limit | `RATE_LIMITED` |
| Internal | `INTERNAL_ERROR` |

---

## 55. HTTP Status Code Contract

| Code | Usage |
|---|---|
| `200` | Successful `GET`, or a successful action that returns a representation (including legitimate intermediate states like `pending_verification` — Section 16) |
| `201` | Successful creation (`POST` that creates a resource — register, cart item, checkout session, manufacturing request, file upload, quote) |
| `202` | Accepted, processing asynchronously (refund initiation, enumeration-safe auth responses) |
| `204` | Successful action with no response body (logout, delete-address) |
| `400` | Malformed/invalid request the client can fix by changing input (validation errors, invalid webhook signature) |
| `401` | Missing/invalid/expired authentication |
| `403` | Authenticated but not authorized (role/permission, unverified email, IDOR-adjacent cases resolved as `404` instead per Section 59) |
| `404` | Resource does not exist, or exists but the caller must not be told it exists (ownership mismatch) |
| `409` | A conflict with current state (expired reservation, superseded quote, invalid state transition, duplicate resource) |
| `422` | Semantically invalid request the client could not have caught via simple format validation (unserviceable address, quote not in an approvable business state where `409` framing doesn't fit as cleanly — used sparingly and consistently per endpoint, not interchangeably with `409`) |
| `429` | Rate limited |
| `500` | Unhandled internal error |
| `502`/`503` | Upstream external provider (Razorpay/Shiprocket/Cloudinary/Resend) unavailable or returned an unexpected error, normalized (Section 62) rather than passed through raw |

---

## 56. Idempotency Contract

**`Idempotency-Key` header**, supported (and, for the flagged endpoints, required) on:

| Endpoint | Idempotency-Key | Behavior |
|---|---|---|
| `CHECKOUT-API-001` (create session) | Optional | A repeat call with the same key within a short window returns the original session rather than creating a second |
| `PAYMENT-API-001` (initiate) | Optional | Naturally near-idempotent already (Section 16) via existing-pending-payment lookup; the header provides an extra explicit guarantee for a client that wants it |
| `PAYMENT-API-005` (refund) | **Required** | A retried refund request with the same key returns the original refund's result rather than issuing a second refund against Razorpay |
| `ADMIN-SHIP-API-001`/`002` (create shipment) | **Required** | Prevents duplicate shipment/label creation on a client-side retry |
| `MFG-API-001`/`DESIGN-API-001`/`SW-API-001`/`CONSULT-API-001` (submit request) | Recommended | Combined with the server-side short-window duplicate-payload check (Section 21) as a second line of defense |

**Key scope:** unique per (customer or admin, endpoint) — the same key value reused against a *different* endpoint or by a *different* caller is not treated as a duplicate of anything.
**Retention:** idempotency records are retained for 24 hours, sufficient to cover any realistic client retry window without unbounded storage growth.
**Duplicate response:** an exact repeat (same key, same endpoint, same caller) within the retention window returns the original response verbatim (same status code and body) rather than re-executing.
**Conflict behavior:** the same key reused with a *different* request body is rejected with `409 IDEMPOTENCY_KEY_REUSED` — a client must not reuse a key for a genuinely different operation.

Webhook idempotency (Section 17/20) uses the provider's own event ID as the deduplication key instead of the `Idempotency-Key` header mechanism, since the header is a client-supplied concept and webhooks are provider-initiated.

---

## 57. Concurrency Contract

- **Inventory (checkout session creation):** row-level locking at the database layer (Document 02 §12) means the API contract itself only needs to define the *outcome* — the second of two simultaneous `CHECKOUT-API-001` calls for the last unit of stock receives `409 INSUFFICIENT_STOCK`, never a silently-succeeded double reservation.
- **Order cancellation:** `ORDER-API-003` re-checks `Order.status` at execution time (not merely at request validation time) — a race between an admin advancing the order to `shipped` and a customer calling cancel resolves to whichever transaction commits first; the loser receives `409`.
- **Quote approval (two browser tabs, or a stale cached quote):** `QUOTE-API-005`/`006` re-check the current version at execution time; a race against `ADMIN-QUOTE-API-004` (revise) resolves via the optimistic `version` column (Document 02 §11) — the loser receives `409 QUOTE_SUPERSEDED` with the fresh version embedded (Section 33).
- **Quote revision (two admins editing concurrently):** the same optimistic `version` check applies symmetrically to admin actions — a second admin's stale revise attempt against an already-revised quote receives `409`.
- **Payment callbacks (frontend confirm vs. webhook race):** Section 16/17 already define this as inherently safe by construction (both paths converge on the same idempotent transition method) — no additional API-level conflict handling is needed beyond what's already specified.
- **Shipment creation (double-click on "Create Shipment"):** protected by the required `Idempotency-Key` (Section 56).

---

## 58. Authorization Contract

**Endpoint Permission Matrix** (abbreviated to representative endpoints per domain; the full inventory in Section 82 carries the same permission column for every endpoint).

| Endpoint | Guest | Customer | SUPER_ADMIN | MANUFACTURING_MANAGER | ORDER_MANAGER | SUPPORT_EXECUTIVE | FINANCE_MANAGER |
|---|---|---|---|---|---|---|---|
| `GET /products`, `/categories`, `/search/*` | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| `POST /auth/register`, `/auth/login` | Allowed | Allowed (login only, no-op re-register) | N/A (admin uses `/admin/auth/login`) | N/A | N/A | N/A | N/A |
| `/cart/*`, `/checkout/*` | Denied (redirect to login) | Allowed (own data) | Denied | Denied | Denied | Denied | Denied |
| `/orders/*` (customer) | Denied | Allowed (own data only) | Denied (uses `/admin/orders/*`) | Denied | Denied | Denied | Denied |
| `/manufacturing/*`, `/design/*`, `/software/*`, `/consultations/*` (customer) | Denied | Allowed (own data only) | Denied (uses admin equivalents) | Denied | Denied | Denied | Denied |
| `/quotes/*` (customer approve/reject) | Denied | Allowed (own quotes only) | Denied | Denied | Denied | Denied | Denied |
| `/files/*` (customer) | Denied | Allowed (own files only) | Denied | Denied | Denied | Denied | Denied |
| `/reviews` (create) | Denied | Allowed (own eligible targets) | Denied | Denied | Denied | Denied | Denied |
| `GET /admin/orders/*` | Denied | Denied | Allowed | Denied | Allowed | Allowed (read-only) | Denied |
| `PATCH /admin/orders/{id}/status` | Denied | Denied | Allowed | Denied | Allowed | Denied | Denied |
| `/admin/manufacturing/*`, `/admin/design/*`, `/admin/software/*`, `/admin/consultations/*` | Denied | Denied | Allowed | Allowed | Denied | Denied | Denied |
| `/admin/quotes/*` | Denied | Denied | Allowed | Allowed | Denied | Denied | Denied |
| `POST /admin/payments/{id}/refund` | Denied | Denied | Allowed | Denied | Denied | Denied | Allowed |
| `/admin/inventory/*` (adjust) | Denied | Denied | Allowed | Denied | Allowed | Denied | Denied |
| `/admin/customers/*` | Denied | Denied | Allowed | Denied (context-only via requests) | Denied (context-only via orders) | Allowed | Denied |
| `/admin/reviews/*` (moderate) | Denied | Denied | Allowed | Denied | Denied | Allowed | Denied |
| `/admin/analytics` (`report=revenue`) | Denied | Denied | Allowed | Denied | Denied | Denied | Allowed |
| `/admin/audit-logs` | Denied | Denied | Allowed (all entries) | Allowed (own actions only) | Allowed (own actions only) | Allowed (own actions only) | Allowed (own actions only) |
| `/admin/customers/{id}/deactivate` | Denied | Denied | Allowed | Denied | Denied | Denied | Denied |

This matrix is directly generated from, and must stay in sync with, Document 02's Section 21 role table — any future role/permission change updates that document first, and this matrix is regenerated to match (Section 1's change-control rule).

---

## 59. Object Ownership / IDOR Protection

**Universal rule, applied to every endpoint accepting a resource ID belonging to a customer-owned or role-scoped entity:** the repository layer (Document 02 §7) filters by ownership/role-scope as part of the query itself — never as a post-fetch check — and a non-matching ID returns `404`, never `403` and never a partial/redacted representation of another party's data.

Applies explicitly to:

- **Orders** (`ORDER-API-002/003/004`) — `WHERE user_id = current_user.id`.
- **Addresses** (`USER-API-007/008`) — same pattern.
- **Manufacturing/Design/Software/Consultation requests** (all `*-API-003` detail endpoints and their sub-resources) — same pattern.
- **Projects** (`PROJECT-API-003` and onward) — same pattern.
- **Files** (`FILES-API-002/003/004`) — ownership *or* role-scope match (Section 30), whichever applies to the caller type.
- **Quotes** (`QUOTE-API-002` through `006`) — scoped via the owning request's `user_id`.
- **Payments** (`PAYMENT-API-003/004`) — `WHERE user_id = current_user.id` (via the linked order/quote's owner).
- **Reviews** (`REVIEW-API-003/004`) — same pattern for edit/delete.

**Admin-side equivalent:** an admin's role-scope filter (Section 58) is applied identically at the repository layer for every `/admin/*` endpoint — an `ORDER_MANAGER` calling `GET /api/v1/admin/manufacturing/requests/{id}` receives `403` (not `404` — since the admin *should* know this domain exists, just not that they can access it; this is the one deliberate exception to the "404 for ownership" pattern, reserved specifically for role-based domain restriction between staff, where enumeration-safety against a colleague is not the same concern as against an anonymous attacker probing customer data).

---

## 60. Rate Limiting

Recommended V1 starting limits (Redis-backed, Document 02 §22) — explicitly implementation-tunable, not final SLA commitments:

| Endpoint(s) | Suggested Limit | Rationale |
|---|---|---|
| `POST /auth/login` | 10 attempts / 15 min per (IP + email) | Credential-stuffing resistance |
| `POST /auth/register` | 5 / hour per IP | Bot-registration resistance |
| `POST /auth/forgot-password`, `/resend-verification` | 3 / hour per email, 10 / hour per IP | Email-bombing resistance |
| `POST /payments/initiate` | 10 / hour per customer | Abuse/probing resistance without blocking legitimate retries |
| `POST /files` (upload) | 30 / hour per customer | Storage-abuse resistance |
| `GET /search/products`, `/search/autocomplete` | 60 / minute per IP | Basic scraping resistance without hampering normal browsing |
| `POST /webhooks/razorpay`, `/webhooks/shiprocket` | Not rate-limited by count (signature verification is the actual gate); a generous ceiling exists only to protect against a misbehaving/looping sender, not normal traffic | Legitimate webhook volume must never be throttled |
| All other authenticated endpoints | A generous general ceiling (e.g., 300 / minute per customer/admin) | Baseline abuse protection without affecting normal usage |

---

## 61. Webhook Contract

**Unified principles, applied identically to both Razorpay and Shiprocket webhooks (Sections 17, 20):**

```
Provider
   │
   ▼
VenopAI Webhook Endpoint (unauthenticated by JWT)
   │
   ▼
Signature/Authenticity Verification  ──(fails)──▶ 400, discarded, logged as a security event
   │ (passes)
   ▼
Event ID Deduplication  ──(duplicate)──▶ 200 immediately, no reprocessing
   │ (new)
   ▼
Persist raw event reference + enqueue Celery task
   │
   ▼
Respond 200 to provider (fast, before business processing completes)
   │
   ▼ (async, in worker)
Business State Update (idempotent service methods)
   │
   ▼
Downstream Follow-up (notification, order/request status transition, etc.)
```

- No webhook endpoint ever performs its full business-logic processing synchronously within the request-response cycle — this guarantees the provider always gets a fast, reliable `200` and is never left retrying due to VenopAI's own processing latency.
- No webhook endpoint trusts any field in the payload before signature verification — verification is always the first operation, before any parsing beyond what's needed to check the signature.

---

## 62. External API Normalization

VenopAI never passes a raw provider response through to any client. Representative normalizations:

| Provider Concept | Raw Provider Value (illustrative) | VenopAI Normalized Value |
|---|---|---|
| Razorpay payment status | `captured` | `successful` |
| Razorpay payment status | `failed` | `failed` |
| Shiprocket shipment status | Provider-specific status code/string (varies by carrier integration) | One of: `created`, `in_transit`, `out_for_delivery`, `delivered`, `exception`, `returned` |
| Shiprocket serviceability response | Provider-specific payload shape | `{"serviceable": true, "estimated_days_min": ..., "estimated_days_max": ...}` |
| Cloudinary upload response | Provider's public ID/URL structure | VenopAI's own `file_id` (UUID) is the only identifier any client ever sees; the Cloudinary reference lives only in backend-internal storage |

This mapping lives inside each `integrations/` module (Document 02 §6) and is the only place provider-specific vocabulary is allowed to exist — every router/schema/service above it speaks only VenopAI's own normalized vocabulary.

---

## 63. Payment Data Contract

Fields VenopAI stores per `Payment` record (restated precisely, since this governs what the API can ever expose):

| Field | Description |
|---|---|
| `id` | VenopAI UUID |
| `linked_order_id` / `linked_quote_id` | Exactly one of these is set |
| `provider` | Always `"razorpay"` in V1 |
| `gateway_reference` | Razorpay order ID + payment ID (opaque strings) |
| `amount`, `currency` | The charged amount |
| `status` | Per Section 18 |
| `created_at`, `confirmed_at`, `refunded_at` | Timestamps |
| `verification_method` | `"webhook"` or `"frontend_callback"` (whichever resolved the state first — Section 16's race handling), retained for audit/debugging |
| `refund_references[]` | Linked `Refund` record IDs, if any |

**Never stored:** card numbers, UPI IDs, bank account details, CVV, or any other raw payment instrument data (SEC-004) — Razorpay's hosted flow ensures none of this ever reaches VenopAI's servers in the first place.

---

## 64. Shipping Data Contract

| Field | Description |
|---|---|
| `id` | VenopAI UUID |
| `linked_order_id` / `linked_manufacturing_request_id` / `linked_design_request_id` | Exactly one set |
| `provider` | Always `"shiprocket"` in V1 |
| `provider_shipment_id` | Shiprocket's internal reference (opaque) |
| `carrier` | The actual courier partner Shiprocket assigned (e.g., "Delhivery") |
| `tracking_number` | AWB number |
| `status` | Normalized per Section 62 |
| `estimated_delivery` | Calculated estimate (SHIP-002) |
| `events[]` | Normalized tracking history |
| `created_at`, `delivered_at` | Timestamps |

---

## 65. File Data Contract

| Field | Description |
|---|---|
| `id` | VenopAI UUID |
| `owner_id` | The uploading customer's ID |
| `association_type`, `association_id` | Exactly one request (of the four service types) — FILE-002 |
| `filename` | Original filename as uploaded |
| `content_type` | Validated MIME type |
| `size_bytes` | File size |
| `storage_provider` | Always `"cloudinary"` in V1 |
| `storage_reference` | Cloudinary's internal reference — **never exposed to any client**, accessed only server-side to generate a signed URL (Section 30) |
| `scan_status` | Per Section 31 |
| `uploaded_by` | `"customer"` or `"admin"` (distinguishing reference uploads from deliverables, Document 03 §29/§43) |
| `created_at` | Timestamp |

---

## 66. Quote Data Contract

```
Quote
 ├── id, request_type, request_id, created_at
 └── QuoteVersion (1..N)
      ├── id, quote_id, version_number, status, line_items[], subtotal, tax, shipping_amount, total,
      │   estimated_timeline, valid_until, terms, created_at
      └── QuoteApproval (0..N)
           ├── id, quote_version_id, action ("approved"|"rejected"), actor_id (customer), reason (nullable), occurred_at
```

**Immutability, restated as a data-contract fact:** once a `QuoteVersion` row is created, no field on it is ever updated by any endpoint in this document except its `status` (via the well-defined transitions in Section 34) — `line_items`, `total`, `terms`, etc. are write-once at version-creation time. A change to any of those values always means a new `QuoteVersion` row with an incremented `version_number`, never an `UPDATE` to an existing row's content fields.

---

## 67. API Status Transition Contract

Consolidates Sections 15, 18, 22, 34 into one authoritative reference table format, per the instruction.

**Order:**
| Current | Action | Actor | Next | Conditions |
|---|---|---|---|---|
| (none) | Verified payment succeeds | System | `paid` | ORD-001: no `pending_payment` Order row ever exists |
| `paid` | Begin fulfillment prep | Admin | `processing` | — |
| `processing` | Ready for pickup | Admin | `ready_to_ship` | — |
| `ready_to_ship` | Shipment created + picked up | System | `shipped` | Requires a `Shipment` record to exist |
| `shipped` | Carrier confirms delivery | System | `delivered` | — |
| `delivered` | Auto/admin confirmation | System/Admin | `completed` | — |
| `paid`/`processing` | Cancel | Customer/Admin | `cancelled` | ORD-003: pre-fulfillment only |

**Payment:**
| Current | Action | Actor | Next | Conditions |
|---|---|---|---|---|
| `pending` | Verified success | System (webhook or confirm callback) | `successful` | Signature-verified only |
| `pending` | Verified failure/expiry | System | `failed` | — |
| `successful` | Admin refund | Admin (`FINANCE_MANAGER`) | `refunded`/`partially_refunded` | Razorpay confirmation required |

**Shipment:**
| Current | Action | Actor | Next | Conditions |
|---|---|---|---|---|
| `created` | Carrier picks up | System (Shiprocket event) | `in_transit` | — |
| `in_transit` | Out for delivery | System | `out_for_delivery` | — |
| `out_for_delivery` | Delivered | System | `delivered` | — |
| any | Delivery problem | System | `exception` | Surfaced to admin (Document 01 §24) |
| `exception` | Resolved | Admin | `in_transit`/`delivered` | Manual resolution |

**Manufacturing/Design/Software Request:** full table in Section 22.

**Quote:** full table in Section 34.

**Service Request (Consultation):**
| Current | Action | Actor | Next | Conditions |
|---|---|---|---|---|
| `submitted` | Admin begins work | Admin | `in_progress` | — |
| `in_progress` | Admin responds | Admin | `responded` | — |
| `responded` | Customer/Admin confirms resolution | Either | `completed` | — |
| any non-terminal | Inactivity threshold reached | System (scheduled) | `closed` | Document 02 §19 |
| any non-terminal | Admin converts | Admin | (unchanged; a linked `Quote` is created) | — |

---

## 68. API → UI Traceability

| Screen (Doc 03) | UI Action | API Endpoint | Method | Auth | Permission |
|---|---|---|---|---|---|
| Product Details (§14) | Add to Cart | `/api/v1/cart/items` | POST | Customer | Own cart |
| Cart (§16) | Update quantity | `/api/v1/cart/items/{id}` | PATCH | Customer | Own cart |
| Checkout — Address (§17) | Select/confirm address, begin checkout | `/api/v1/checkout/sessions` | POST | Customer (verified) | Own data |
| Checkout — Payment (§18) | Pay Now | `/api/v1/payments/initiate` | POST | Customer | Own session/quote |
| Payment UX — Confirming (§18) | (automatic) confirm callback | `/api/v1/payments/{id}/confirm` | POST | Customer | Own payment |
| Order Details (§21) | Cancel order | `/api/v1/orders/{id}/cancel` | POST | Customer | Own order |
| Order Details (§19) | Download invoice | `/api/v1/orders/{id}/invoice` | GET | Customer | Own order |
| Request Manufacturing (§24) | Submit request | `/api/v1/manufacturing/requests` | POST | Customer (verified) | Own data |
| Clarification (§26) | Respond to a question | `/api/v1/manufacturing/requests/{id}/clarifications/{cid}/respond` | POST | Customer | Own request |
| Quote Details (§27) | Approve | `/api/v1/quotes/{id}/approve` | POST | Customer | Own quote |
| Quote Details (§27) | Reject | `/api/v1/quotes/{id}/reject` | POST | Customer | Own quote |
| Manufacturing Progress (§23) | Request cancellation (post-execution) | `/api/v1/manufacturing/requests/{id}/cancel` | POST | Customer | Own request |
| Project Details (§32) | Link a request | `/api/v1/projects/{id}/link` | POST | Customer | Own data |
| Reviews (§33) | Submit review | `/api/v1/reviews` | POST | Customer | Eligible target only |
| Admin Dashboard (§37) | Open a queue item | (relevant domain's detail GET, e.g. `/api/v1/admin/orders/{id}`) | GET | Admin | Role-scoped |
| Admin Order Detail (§39) | Refund | `/api/v1/payments/{id}/refund` | POST | Admin | `FINANCE_MANAGER`/`SUPER_ADMIN` |
| Admin Manufacturing Detail (§41) | Create quote | `/api/v1/admin/quotes` | POST | Admin | `MANUFACTURING_MANAGER`/`SUPER_ADMIN` |
| Admin Quote (§42) | Revise quote | `/api/v1/admin/quotes/{id}/revise` | POST | Admin | `MANUFACTURING_MANAGER`/`SUPER_ADMIN` |
| Admin Reviews (§44) | Hide review | `/api/v1/admin/reviews/{id}/hide` | POST | Admin | `SUPPORT_EXECUTIVE`/`SUPER_ADMIN` |
| Admin Audit Logs (§46) | View log | `/api/v1/admin/audit-logs` | GET | Admin | `SUPER_ADMIN` (all) / others (own) |

No major actionable element in Document 03 lacks a corresponding row (or an equivalent one omitted here only because it is structurally identical to a row already shown, per Section 24's shared-pattern decision).

---

## 69. API → Product Requirement Traceability

| Requirement ID (Doc 01) | API Endpoint(s) | Domain |
|---|---|---|
| AUTH-001 | `AUTH-API-001/002/004`, plus verification gates on `CHECKOUT-API-001`, `MFG-API-001` et al. | Auth |
| CART-001 | `CART-API-002` (explicitly no reservation side effect) | Cart |
| INV-001–006 | `CHECKOUT-API-001`, `ADMIN-INV-API-*` | Inventory |
| CHK-001–004 | `CHECKOUT-API-001/002/003` | Checkout |
| ORD-001–003 | `PAYMENT-API-002`/webhook (order creation), `ORDER-API-003` | Orders |
| PAY-001–005 | `PAYMENT-API-001–005`, `WEBHOOK-API-001` | Payments |
| SHIP-001–004 | `SHIP-API-001–003`, `ADMIN-SHIP-API-001/002`, `WEBHOOK-API-002` | Shipping |
| MFG-001–006 | `MFG-API-001–007`, `ADMIN-MFG-API-001–009` | Manufacturing |
| DESIGN-001/002 | `DESIGN-API-001–006` | Design |
| SW-001/002 | `SW-API-001–005` | Software |
| CONSULT-001/002 | `CONSULT-API-001–006`, `ADMIN-CONSULT-API-001–004` | Consultation |
| FILE-001–004 | `FILES-API-001–004`, `ADMIN-FILES-API-001–003` | Files |
| QUOTE-001–004 | `QUOTE-API-001–006`, `ADMIN-QUOTE-API-001–006` | Quotes |
| REV-001–003 | `REVIEW-API-001–005`, `ADMIN-REVIEW-API-001–003` | Reviews |
| NOTIF-001/002 | `NOTIF-API-001` (log only — sending itself is not a client-callable API) | Notifications |
| ACCT-001 | Enforced universally per Section 59, not a single endpoint | Cross-cutting |
| ADMIN-001 | Enforced universally per Section 58/Document 02 §21 | Cross-cutting |
| AUDIT-001/002 | `ADMIN-AUDIT-API-001` (read); write side is internal, triggered by every state-changing admin/system action, not itself an endpoint | Audit |

---

## 70. API → Technical Component Traceability

| Endpoint Group | FastAPI Module (Doc 02 §6) | Key Service | Integration |
|---|---|---|---|
| `/auth/*` | `modules/auth` | `AuthService` | `notifications` (email) |
| `/products`, `/categories`, `/search/*` | `modules/catalog`, `modules/categories`, `modules/search` | `CatalogService`, `SearchService` | — |
| `/cart/*` | `modules/cart` | `CartService` | `modules/inventory` (read) |
| `/checkout/*` | `modules/orders` (session logic) + `modules/inventory` | `CheckoutService`, `InventoryService` | — |
| `/orders/*` | `modules/orders` | `OrderService` | `modules/shipping`, `modules/payments` |
| `/payments/*`, `/webhooks/razorpay` | `modules/payments` | `PaymentService` | `integrations/razorpay` |
| `/shipping/*`, `/shipments/*`, `/webhooks/shiprocket` | `modules/shipping` | `ShippingService` | `integrations/shiprocket` |
| `/manufacturing/*` | `modules/manufacturing` | `ManufacturingService` | `modules/files`, `modules/quotes` |
| `/design/*` | `modules/design` | `DesignService` | `modules/files`, `modules/quotes` |
| `/software/*` | `modules/software` | `SoftwareService` | `modules/files`, `modules/quotes` |
| `/consultations/*` | `modules/consultation` | `ConsultationService` | `modules/quotes` |
| `/projects/*` | `modules/projects` | `ProjectService` | — |
| `/files/*` | `modules/files` | `FileService` | `integrations/cloudinary` |
| `/quotes/*`, `/admin/quotes/*` | `modules/quotes` | `QuoteService` | `modules/payments` |
| `/reviews/*` | `modules/reviews` | `ReviewService` | — |
| `/notifications` | `modules/notifications` | `NotificationService` | `integrations/resend` |
| `/admin/*` | `modules/admin` (thin pass-through layer) | Delegates to each domain's own service | — |
| `/admin/analytics*` | `modules/analytics` | `AnalyticsService` | Read-only across domains |

---

## 71. API Security Checklist

- ✅ **Authentication** — JWT bearer + rotating HTTP-only refresh cookie on every non-public endpoint (Section 6, Document 02 §20).
- ✅ **Authorization** — permission-checked server-side on every endpoint, never inferred from UI state (Section 58).
- ✅ **IDOR** — ownership/role-scope filtering at the repository layer, `404` for non-owned resources (Section 59).
- ✅ **Validation** — Pydantic schemas on every request body; explicit allow-lists for filters (Section 53).
- ✅ **Rate limiting** — applied per Section 60, weighted toward abuse-prone endpoints.
- ✅ **Webhook verification** — signature-checked before any processing, for both providers (Sections 17, 20).
- ✅ **Payment verification** — server-side only, never trusting a frontend callback alone (Sections 16, 18).
- ✅ **File security** — private by default, malware-scanned, signed short-lived URLs only (Sections 29–31).
- ✅ **Sensitive data exposure** — no raw payment instrument data (Section 63), no Cloudinary storage references (Section 65), no internal DB IDs beyond the UUID contract (Section 5) ever leave the backend.
- ✅ **CORS** — restricted to known frontend origins (Document 02 §22).
- ✅ **CSRF** — double-submit token on the cookie-based refresh flow (Section 6, Document 02 §20).
- ✅ **Token security** — short-lived access tokens, rotating refresh tokens, server-side revocation list (Document 02 §20).
- ✅ **Secrets** — Razorpay/Shiprocket/Cloudinary/Resend secrets never appear in any response body, only `key_id` (Razorpay's public key) is ever exposed (Section 16).
- ✅ **Logging** — request IDs and structured logs (Document 02 §29); passwords, tokens, and payment/file secrets are explicitly excluded from any log line (Section 76).
- ✅ **Audit** — every state-changing admin action logged immutably (Section 49).
- ✅ **Error disclosure** — the consistent error envelope (Section 54) never includes a stack trace or internal exception detail.

---

## 72. API Testing Contract

For every domain, the minimum required test coverage is:

| Domain | Happy Path | Validation | Unauthorized | Forbidden | Not Found | Conflict | Duplicate Request | Provider Failure |
|---|---|---|---|---|---|---|---|---|
| Authentication | ✓ | ✓ | N/A | N/A | N/A | ✓ (dup. email) | ✓ (dup. register) | N/A |
| Catalog | ✓ | ✓ | N/A | N/A | ✓ | N/A | N/A | N/A |
| Cart | ✓ | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| Checkout | ✓ | ✓ | ✓ | N/A | ✓ | ✓ (expired/insufficient stock) | ✓ (idempotency key) | N/A |
| Inventory | ✓ | ✓ | ✓ (admin) | ✓ (role) | ✓ | ✓ (concurrent reservation) | N/A | N/A |
| Orders | ✓ | ✓ | ✓ | N/A | ✓ (IDOR) | ✓ (non-cancellable) | N/A | N/A |
| Payments | ✓ | ✓ | ✓ | N/A | ✓ | ✓ (already refunded) | ✓ (dup. webhook) | ✓ (Razorpay timeout) |
| Shipping | ✓ | ✓ | N/A | N/A | ✓ | N/A | ✓ (dup. webhook) | ✓ (Shiprocket timeout) |
| Manufacturing | ✓ | ✓ | ✓ | N/A | ✓ (IDOR) | ✓ (invalid transition) | ✓ (dup. submit) | N/A |
| Quotes | ✓ | ✓ | ✓ | N/A | ✓ | ✓ (superseded/expired) | N/A | N/A |
| Files | ✓ | ✓ | ✓ | ✓ (role) | ✓ (IDOR) | N/A | N/A | ✓ (Cloudinary failure) |
| Reviews | ✓ | ✓ | ✓ | ✓ (not eligible) | ✓ | ✓ (duplicate) | N/A | N/A |
| Admin (general) | ✓ | ✓ | ✓ | ✓ (role) | ✓ | ✓ | N/A | N/A |
| RBAC | ✓ (per role) | N/A | N/A | ✓ (cross-role denial matrix, Section 58) | N/A | N/A | N/A | N/A |
| Webhooks | ✓ | ✓ (bad signature) | N/A | N/A | N/A | N/A | ✓ (dup. event) | ✓ (malformed payload) |

---

## 73. Critical Integration Tests

**TEST 1 — Customer purchases a product.** Register → verify → browse → add to cart → open checkout session → pay → verify webhook and frontend confirm both resolve to one `Order` in `paid` status with exactly one `successful` `Payment`.

**TEST 2 — Customer attempts to buy unavailable stock.** Product with `available_quantity = 0`; `CART-API-002` succeeds with `stock_warning: true`; `CHECKOUT-API-001` returns `409 INSUFFICIENT_STOCK` for that line item.

**TEST 3 — Two customers compete for the final unit.** Both call `CHECKOUT-API-001` near-simultaneously for the last unit; exactly one receives a `201` with a reservation; the other receives `409`.

**TEST 4 — Payment succeeds.** `PAYMENT-API-001` → Razorpay sandbox success → both `PAYMENT-API-002` and the Razorpay webhook fire; assert only one `Order` is created and `Payment.status == successful` regardless of arrival order.

**TEST 5 — Payment fails.** Razorpay sandbox failure → `Payment.status == failed`; assert the associated `InventoryReservation` is released immediately (not left to expire).

**TEST 6 — Duplicate Razorpay webhook arrives.** Replay the identical webhook event twice; assert no duplicate `Order`, no double-processed refund/notification, and the second call still returns `200`.

**TEST 7 — Shipment creation succeeds.** Order reaches `ready_to_ship` → `ADMIN-SHIP-API-001` → assert `Shipment` created with a tracking number and `Order.status → shipped` only after Shiprocket confirms pickup (not merely on the creation call).

**TEST 8 — Manufacturing request created.** `MFG-API-001` with valid required fields and a pre-uploaded `file_id` → assert `status == submitted` and the file's association is set correctly.

**TEST 9 — Manufacturing clarification.** Admin raises two questions → customer resolves one → assert request remains `clarification_needed`; customer resolves the second → assert automatic transition out of `clarification_needed`.

**TEST 10 — Quote created.** `ADMIN-QUOTE-API-001` then `ADMIN-QUOTE-API-003` (send) → assert `QuoteVersion.version_number == 1`, `status == sent`, and the linked request remains `quote_ready`.

**TEST 11 — Quote approved.** `QUOTE-API-005` → assert `status == approved`, `QuoteApproval` record created, linked request transitions to `payment_pending`, and `PAYMENT-API-001` with `source_type: quote` now succeeds where it previously would have `409`'d.

**TEST 12 — Quote revised.** `ADMIN-QUOTE-API-004` on a `sent` (not yet approved) quote → assert `version_number == 2`, `version 1.status == superseded`, and `version 2.status == sent`.

**TEST 13 — Old quote version cannot be modified or approved.** Attempt `QUOTE-API-005` against `version 1`'s ID after it's superseded → assert `409 QUOTE_SUPERSEDED` with `version 2` embedded in the error; assert no endpoint anywhere accepts a body that would mutate `version 1`'s content fields.

**TEST 14 — Private file access by owner.** Upload a file, wait for `scan_status == clean`, call `FILES-API-003` as the owner → assert a valid signed URL is returned.

**TEST 15 — Unauthorized customer attempts another customer's file.** Customer B calls `FILES-API-003` with Customer A's `file_id` → assert `404` (Section 59), and assert no signed URL is generated (verify no Cloudinary call was even made, to confirm the check happens before URL generation, not after).

**TEST 16 — Admin role restrictions.** `ORDER_MANAGER` attempts `GET /api/v1/admin/manufacturing/requests` → assert `403`; `SUPPORT_EXECUTIVE` attempts `POST /api/v1/admin/payments/{id}/refund` → assert `403`.

**TEST 17 — Refund.** `FINANCE_MANAGER` calls `PAYMENT-API-005` on a `successful` payment → assert `Refund` record created, `Payment.status → refunded` only after simulated Razorpay refund-webhook confirmation (not optimistically on the initiating call).

---

## 74. API Documentation Standard

- The implementation's OpenAPI schema (auto-generated by FastAPI from the Pydantic models and route decorators) is treated as the **generated, machine-validated representation** of this contract — never the other way around; if the generated schema and this document disagree, this document is corrected first (or the implementation is, if the divergence reveals an implementation bug), per the change-control rule in Section 1.
- Every route is tagged by domain (matching Section 3's grouping) so the generated Swagger/ReDoc UI mirrors this document's structure.
- Every route includes a `summary` (one line) and `description` (referencing the relevant Document 01 requirement ID and Document 03 screen where applicable) directly in the FastAPI route decorator's docstring/parameters.
- Every response model is an explicit Pydantic class (Document 02 §7's output-validation principle) so the generated schema always matches Section 51's response contracts exactly — no endpoint returns an ad hoc, undeclared shape.
- Security schemes (`BearerAuth`) are declared once in the OpenAPI security scheme registry and referenced per-route, not redefined per endpoint.
- Example values in the generated docs are drawn from the same JSON examples given throughout this document (Section 84), kept in sync as the single source of example data.

---

## 75. API Versioning

- **V1 is `/api/v1/`.** No `/api/v2/` exists, is planned, or is implied by anything in this document.
- **Backward compatibility within v1:** additive changes (a new optional field, a new endpoint, a new optional query parameter) are permitted without a version bump. Removing a field, changing a field's type/meaning, changing a status code's meaning, or changing a required field are all breaking changes and are **not** permitted within `/api/v1/`.
- **Deprecation:** if a v1 endpoint is ever superseded within the v1 lifetime (e.g., replaced by a better-designed equivalent), the old endpoint remains functional and is marked `deprecated: true` in its OpenAPI entry with a `Deprecation` response header, for a defined overlap period, rather than being removed abruptly.
- **Breaking changes:** require a new version prefix (`/api/v2/`) applied only to the affected domain's routes where feasible, minimizing blast radius — not a wholesale re-versioning of the entire API for one domain's change. This document does not create `/api/v2/` preemptively; it is a future-state process, not a V1 deliverable.
- **Migration strategy:** any future breaking change ships with both versions live simultaneously for a defined overlap window, with the frontend migrated first, then the old version formally retired — consistent with a small-team, budget-conscious operating model that cannot support indefinite dual-version maintenance.

---

## 76. API Observability

- **Request IDs:** every request is assigned a `request_id` (Document 02 §24), present in every response (success and error) and propagated into all logs and Sentry events for that request.
- **Structured logs:** JSON-formatted, including `request_id`, caller identity (customer/admin ID or "anonymous"), endpoint, status code, and latency — per Document 02 §29.
- **Endpoint latency:** tracked per-route via the same structured logging (no separate APM platform stood up for V1, per Document 02 §29's stated scope boundary).
- **Error rates:** visible via Sentry's own aggregation (Document 02 §29) — no custom metrics dashboard is built for V1.
- **External provider latency:** each `integrations/` module logs the duration of its outbound call to Razorpay/Shiprocket/Cloudinary/Resend distinctly from the overall request latency, so a slow provider is distinguishable from a slow VenopAI code path.
- **Webhook processing:** logged distinctly (received timestamp, signature-verification result, processing-queued timestamp, processing-completed timestamp) to make webhook-related support investigations tractable.
- **Never logged:** passwords (hashed or plain), JWT secrets, Razorpay/Shiprocket/Cloudinary/Resend API secrets, raw payment instrument data (none is ever received, per Section 63), private file byte content, and full customer PII beyond what's operationally necessary for a given log line (e.g., a log line references a customer by ID, not by full address, unless actively debugging a shipping-specific issue in a controlled, access-restricted log context).

---

## 77. API Performance Requirements

Practical V1 targets — not enterprise SLA commitments, and explicitly caveated where an external provider dominates latency:

| Category | Target (typical, V1 scale) |
|---|---|
| Normal reads (product detail, category list, order detail) | Sub-300ms server processing time (excluding network/client latency) under normal load |
| Catalog listing / search | Sub-500ms, aided by the PostgreSQL indexing strategy (Document 02 §11/§27) |
| Cart operations | Sub-300ms |
| Checkout session creation | Sub-500ms (includes the row-locked inventory check, Document 02 §12) |
| Order/request detail fetches | Sub-300ms |
| Admin list/table views | Sub-500ms at V1 data volumes |
| File upload | Dominated by the client's upload bandwidth and file size, not VenopAI's own processing — no fixed target beyond "the upload endpoint itself adds minimal overhead beyond the transfer time" |
| External provider calls (Razorpay order creation, Shiprocket rate lookup, Cloudinary signed-URL generation) | **Latency is provider-determined**, not a VenopAI SLA — VenopAI's own added overhead around these calls targets sub-100ms, but the total observed latency for, e.g., "get a shipping rate" is stated honestly to depend on Shiprocket's own response time |

These are engineering targets for V1's early-stage scale, not contractual guarantees made to customers.

---

## 78. API Reliability & Retry

- **Timeouts:** every outbound external-provider call (Razorpay, Shiprocket, Cloudinary, Resend) has an explicit timeout (a few seconds) rather than an unbounded wait, so a provider outage degrades gracefully into a normalized `502`/`503` (Section 55) rather than hanging the request.
- **Retry — safe (idempotent) operations only:** read-only provider calls (e.g., Shiprocket serviceability/rate lookup) may be retried automatically (a small number of attempts with backoff) on a transient failure, since repeating a `GET`-equivalent lookup is harmless.
- **Retry — never blindly applied to non-idempotent operations:** a payment-creation or refund-initiation call to Razorpay is **not** automatically retried on ambiguous failure (e.g., a timeout where the request may have actually succeeded on Razorpay's side) — instead, the system relies on Razorpay's own idempotency mechanisms where available, and otherwise surfaces the ambiguous state to the reconciliation sweep (Document 02 §19) rather than risking a duplicate charge/refund via a naive client-side retry.
- **Exponential backoff:** used for Celery task retries (webhook processing, notification sending, shipment sync) per Document 02 §17/§18/§19, with a bounded maximum attempt count before an item is surfaced for manual/administrative attention rather than retried forever.
- **Circuit-breaking:** not implemented in V1 — with only one payment provider and one shipping provider (no failover target to switch to), a circuit breaker would only convert a provider outage into a faster failure without a fallback to route to, so a simple timeout + retry + eventual reconciliation is the appropriate V1-scale response; this is a deliberate, justified omission rather than an oversight.

---

## 79. V1 API Scope

| Domain | Endpoint Group | Priority | V1 | Notes |
|---|---|---|---|---|
| Auth | `/auth/*` | P0 | Yes | Foundation for everything else |
| Users/Addresses | `/users/*`, `/addresses/*` | P0 | Yes | — |
| Catalog/Categories/Search | `/products/*`, `/categories/*`, `/search/*` | P0 | Yes | — |
| Cart/Checkout | `/cart/*`, `/checkout/*` | P0 | Yes | — |
| Orders | `/orders/*` | P0 | Yes | — |
| Payments | `/payments/*`, `/webhooks/razorpay` | P0 | Yes | — |
| Shipping | `/shipping/*`, `/shipments/*`, `/webhooks/shiprocket` | P0 | Yes | — |
| Manufacturing | `/manufacturing/*` | P0 | Yes | Core differentiator |
| Design | `/design/*` | P1 | Yes | — |
| Software | `/software/*` | P1 | Yes | — |
| Consultation | `/consultations/*` | P1 | Yes | — |
| Projects | `/projects/*` | P2 | Yes | Lightweight grouping only |
| Files | `/files/*` | P0 | Yes | Required by every service domain |
| Quotes | `/quotes/*` | P0 | Yes | Required by every service domain |
| Reviews | `/reviews/*` | P1 | Yes | — |
| Notifications | `/notifications` (read-only log) | P2 | Yes | Minimal, per Doc 03 §34 |
| Admin — all domains | `/admin/*` | P0 | Yes | Required to operate the business at all |
| Admin Analytics | `/admin/analytics*` | P1 | Yes | — |
| Admin Audit | `/admin/audit-logs` | P1 | Yes | — |

No domain in this table is deferred — every one is required for V1 to function as Document 01 describes it; prioritization (P0/P1/P2) reflects build sequencing guidance, not scope exclusion.

---

## 80. API Out of Scope

Explicitly excluded from V1, matching Documents 01–03:

- Microservice-to-microservice APIs (internal service-to-service calls) — the modular monolith has no internal network boundary to expose (Document 02 §36).
- A message-bus/event API (Kafka or equivalent) — Celery/Redis covers all V1 async needs.
- Advanced AI APIs (recommendation, semantic search, AI design assistance) — no such capability exists in Documents 01–03.
- Mobile-specific API variants — the same `/api/v1/` contract serves any future mobile client without a separate mobile API surface; none is built preemptively.
- SMS/WhatsApp sending endpoints — email-only (NOTIF-001).
- A live-chat/messaging API — Clarification (Section 23) is the only structured communication mechanism, deliberately not chat-shaped.
- Elasticsearch-specific query endpoints — Section 9's search is PostgreSQL-based only.
- A generic multi-provider payment/shipping abstraction API — the provider abstraction exists internally (Document 02 §14/§15) but is not exposed as a client-selectable API option; Razorpay/Shiprocket are the only V1 providers, full stop.
- Enterprise-only APIs (bulk import/export beyond the CSV convenience in Section 48, SSO/SAML, custom-permission API) — none required by Document 01.

---

## 81. Future API Extensibility

The contract is deliberately shaped so these additions are additive, not restructuring, when the business justifies them:

- **Additional payment provider:** implement a new `XProvider(PaymentGateway)` (Document 02 §14); `PAYMENT-API-001`'s `source_type`/`source_id` shape is unaffected — only an internal provider-selection mechanism is added, with no client-facing contract change beyond perhaps a new optional `preferred_provider` field.
- **Additional shipping provider:** identical pattern via `ShippingProvider` (Document 02 §15); `SHIP-API-*` responses are already normalized (Section 62), so a second provider's data would map into the same shape.
- **AI-assisted engineering services:** would be a wholly new module (e.g., `/api/v1/design-assist/*`) added alongside existing ones — never retrofitted into the Manufacturing/Design contract, preserving V1's clean quote-gated request model.
- **Mobile clients:** consume the exact same `/api/v1/` contract already defined here; no separate API is anticipated.
- **Advanced search:** would introduce a new `search` backend behind the same `SEARCH-API-001` contract (query params unchanged), or a clearly versioned successor if the response shape must change meaningfully.
- **Additional integrations (e.g., a CRM sync):** would live entirely inside `/admin/*` as new endpoints, never altering the customer-facing contract.

None of the above is built in V1; this section exists solely to demonstrate that V1's design does not paint the platform into a corner, per Document 02's "incremental scalability" principle (Section 3, item 14) applied at the API layer.

---

## 82. Complete Endpoint Inventory

| ID | Method | Endpoint | Domain | Auth | Permission | V1 |
|---|---|---|---|---|---|---|
| AUTH-API-001 | POST | /api/v1/auth/register | Auth | None | Public | Yes |
| AUTH-API-002 | POST | /api/v1/auth/verify-email | Auth | None | Public (token) | Yes |
| AUTH-API-003 | POST | /api/v1/auth/resend-verification | Auth | None | Public | Yes |
| AUTH-API-004 | POST | /api/v1/auth/login | Auth | None | Public | Yes |
| AUTH-API-005 | POST | /api/v1/auth/refresh | Auth | Refresh cookie | Own session | Yes |
| AUTH-API-006 | POST | /api/v1/auth/logout | Auth | Access/refresh | Own session | Yes |
| AUTH-API-007 | GET | /api/v1/auth/me | Auth | Access | Own identity | Yes |
| AUTH-API-008 | POST | /api/v1/auth/forgot-password | Auth | None | Public | Yes |
| AUTH-API-009 | POST | /api/v1/auth/reset-password | Auth | None | Public (token) | Yes |
| ADMIN-AUTH-API-001 | POST | /api/v1/admin/auth/login | Auth | None | Public (admin) | Yes |
| USER-API-001 | GET | /api/v1/users/me | Users | Access | Own data | Yes |
| USER-API-002 | PATCH | /api/v1/users/me | Users | Access | Own data | Yes |
| USER-API-003 | POST | /api/v1/users/me/email-change | Users | Access | Own data | Yes |
| USER-API-004 | POST | /api/v1/users/me/password-change | Users | Access | Own data | Yes |
| USER-API-005 | GET | /api/v1/addresses | Users | Access | Own data | Yes |
| USER-API-006 | POST | /api/v1/addresses | Users | Access | Own data | Yes |
| USER-API-007 | PATCH | /api/v1/addresses/{address_id} | Users | Access | Own data | Yes |
| USER-API-008 | DELETE | /api/v1/addresses/{address_id} | Users | Access | Own data | Yes |
| CAT-API-001 | GET | /api/v1/products | Catalog | None | Public | Yes |
| CAT-API-002 | GET | /api/v1/products/{product_id} | Catalog | None | Public | Yes |
| CAT-API-003 | GET | /api/v1/categories | Catalog | None | Public | Yes |
| CAT-API-004 | GET | /api/v1/categories/{category_id} | Catalog | None | Public | Yes |
| SEARCH-API-001 | GET | /api/v1/search/products | Search | None | Public | Yes |
| SEARCH-API-002 | GET | /api/v1/search/autocomplete | Search | None | Public | Yes |
| CART-API-001 | GET | /api/v1/cart | Cart | Access | Own data | Yes |
| CART-API-002 | POST | /api/v1/cart/items | Cart | Access | Own data | Yes |
| CART-API-003 | PATCH | /api/v1/cart/items/{item_id} | Cart | Access | Own data | Yes |
| CART-API-004 | DELETE | /api/v1/cart/items/{item_id} | Cart | Access | Own data | Yes |
| CART-API-005 | DELETE | /api/v1/cart | Cart | Access | Own data | Yes |
| CHECKOUT-API-001 | POST | /api/v1/checkout/sessions | Checkout | Access (verified) | Own data | Yes |
| CHECKOUT-API-002 | GET | /api/v1/checkout/sessions/{session_id} | Checkout | Access | Own data | Yes |
| CHECKOUT-API-003 | POST | /api/v1/checkout/sessions/{session_id}/address | Checkout | Access | Own data | Yes |
| ADMIN-INV-API-001 | GET | /api/v1/admin/inventory | Inventory | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-INV-API-002 | GET | /api/v1/admin/inventory/{product_id} | Inventory | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-INV-API-003 | POST | /api/v1/admin/inventory/{product_id}/adjust | Inventory | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-INV-API-004 | GET | /api/v1/admin/inventory/{product_id}/reservations | Inventory | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ORDER-API-001 | GET | /api/v1/orders | Orders | Access | Own data | Yes |
| ORDER-API-002 | GET | /api/v1/orders/{order_id} | Orders | Access | Own data | Yes |
| ORDER-API-003 | POST | /api/v1/orders/{order_id}/cancel | Orders | Access | Own data | Yes |
| ORDER-API-004 | GET | /api/v1/orders/{order_id}/invoice | Orders | Access | Own data | Yes |
| PAYMENT-API-001 | POST | /api/v1/payments/initiate | Payments | Access | Own data | Yes |
| PAYMENT-API-002 | POST | /api/v1/payments/{payment_id}/confirm | Payments | Access | Own data | Yes |
| PAYMENT-API-003 | GET | /api/v1/payments/{payment_id} | Payments | Access | Own data | Yes |
| PAYMENT-API-004 | GET | /api/v1/payments | Payments | Access | Own data | Yes |
| PAYMENT-API-005 | POST | /api/v1/admin/payments/{payment_id}/refund | Payments | Access | FINANCE_MANAGER/SUPER_ADMIN | Yes |
| WEBHOOK-API-001 | POST | /api/v1/webhooks/razorpay | Payments | Signature | Provider | Yes |
| SHIP-API-001 | GET | /api/v1/shipping/serviceability | Shipping | None | Public | Yes |
| SHIP-API-002 | GET | /api/v1/shipments/{shipment_id} | Shipping | Access | Own data | Yes |
| SHIP-API-003 | GET | /api/v1/shipments/{shipment_id}/tracking | Shipping | Access | Own data | Yes |
| ADMIN-SHIP-API-001 | POST | /api/v1/admin/orders/{order_id}/shipment | Shipping | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-SHIP-API-002 | POST | /api/v1/admin/manufacturing/{request_id}/shipment | Shipping | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| WEBHOOK-API-002 | POST | /api/v1/webhooks/shiprocket | Shipping | Signature | Provider | Yes |
| MFG-API-001 | POST | /api/v1/manufacturing/requests | Manufacturing | Access (verified) | Own data | Yes |
| MFG-API-002 | GET | /api/v1/manufacturing/requests | Manufacturing | Access | Own data | Yes |
| MFG-API-003 | GET | /api/v1/manufacturing/requests/{request_id} | Manufacturing | Access | Own data | Yes |
| MFG-API-004 | POST | /api/v1/manufacturing/requests/{request_id}/cancel | Manufacturing | Access | Own data | Yes |
| MFG-API-005 | GET | /api/v1/manufacturing/requests/{request_id}/clarifications | Manufacturing | Access | Own data | Yes |
| MFG-API-006 | POST | /api/v1/manufacturing/requests/{request_id}/clarifications/{clarification_id}/respond | Manufacturing | Access | Own data | Yes |
| MFG-API-007 | GET | /api/v1/manufacturing/requests/{request_id}/history | Manufacturing | Access | Own data | Yes |
| CONSULT-API-001 | POST | /api/v1/consultations | Consultation | Access (verified) | Own data | Yes |
| CONSULT-API-002 | GET | /api/v1/consultations | Consultation | Access | Own data | Yes |
| CONSULT-API-003 | GET | /api/v1/consultations/{id} | Consultation | Access | Own data | Yes |
| CONSULT-API-004 | POST | /api/v1/consultations/{id}/resolve | Consultation | Access | Own data | Yes |
| CONSULT-API-005 | GET | /api/v1/consultations/{id}/clarifications | Consultation | Access | Own data | Yes |
| CONSULT-API-006 | POST | /api/v1/consultations/{id}/clarifications/{clarification_id}/respond | Consultation | Access | Own data | Yes |
| DESIGN-API-001 | POST | /api/v1/design/requests | Design | Access (verified) | Own data | Yes |
| DESIGN-API-002 | GET | /api/v1/design/requests | Design | Access | Own data | Yes |
| DESIGN-API-003 | GET | /api/v1/design/requests/{id} | Design | Access | Own data | Yes |
| DESIGN-API-004 | POST | /api/v1/design/requests/{id}/cancel | Design | Access | Own data | Yes |
| DESIGN-API-005 | GET/POST | /api/v1/design/requests/{id}/clarifications[/...] | Design | Access | Own data | Yes |
| DESIGN-API-006 | POST | /api/v1/design/requests/{id}/start-manufacturing | Design | Access | Own data | Yes |
| SW-API-001 | POST | /api/v1/software/requests | Software | Access (verified) | Own data | Yes |
| SW-API-002 | GET | /api/v1/software/requests | Software | Access | Own data | Yes |
| SW-API-003 | GET | /api/v1/software/requests/{id} | Software | Access | Own data | Yes |
| SW-API-004 | POST | /api/v1/software/requests/{id}/cancel | Software | Access | Own data | Yes |
| SW-API-005 | GET/POST | /api/v1/software/requests/{id}/clarifications[/...] | Software | Access | Own data | Yes |
| PROJECT-API-001 | GET | /api/v1/projects | Projects | Access | Own data | Yes |
| PROJECT-API-002 | POST | /api/v1/projects | Projects | Access | Own data | Yes |
| PROJECT-API-003 | GET | /api/v1/projects/{id} | Projects | Access | Own data | Yes |
| PROJECT-API-004 | PATCH | /api/v1/projects/{id} | Projects | Access | Own data | Yes |
| PROJECT-API-005 | POST | /api/v1/projects/{id}/link | Projects | Access | Own data | Yes |
| PROJECT-API-006 | POST | /api/v1/projects/{id}/unlink | Projects | Access | Own data | Yes |
| PROJECT-API-007 | GET | /api/v1/projects/{id}/files | Projects | Access | Own data | Yes |
| FILES-API-001 | POST | /api/v1/files | Files | Access | Own data | Yes |
| FILES-API-002 | GET | /api/v1/files/{file_id} | Files | Access | Own data | Yes |
| FILES-API-003 | GET | /api/v1/files/{file_id}/download | Files | Access | Own data | Yes |
| FILES-API-004 | DELETE | /api/v1/files/{file_id} | Files | Access | Own data | Yes |
| QUOTE-API-001 | GET | /api/v1/quotes | Quotes | Access | Own data | Yes |
| QUOTE-API-002 | GET | /api/v1/quotes/{quote_id} | Quotes | Access | Own data | Yes |
| QUOTE-API-003 | GET | /api/v1/quotes/{quote_id}/versions | Quotes | Access | Own data | Yes |
| QUOTE-API-004 | GET | /api/v1/quotes/{quote_id}/versions/{version_id} | Quotes | Access | Own data | Yes |
| QUOTE-API-005 | POST | /api/v1/quotes/{quote_id}/approve | Quotes | Access | Own data | Yes |
| QUOTE-API-006 | POST | /api/v1/quotes/{quote_id}/reject | Quotes | Access | Own data | Yes |
| REVIEW-API-001 | POST | /api/v1/reviews | Reviews | Access | Own data (eligible) | Yes |
| REVIEW-API-002 | GET | /api/v1/reviews/mine | Reviews | Access | Own data | Yes |
| REVIEW-API-003 | PATCH | /api/v1/reviews/{review_id} | Reviews | Access | Own data | Yes |
| REVIEW-API-004 | DELETE | /api/v1/reviews/{review_id} | Reviews | Access | Own data | Yes |
| REVIEW-API-005 | GET | /api/v1/products/{product_id}/reviews | Reviews | None | Public | Yes |
| NOTIF-API-001 | GET | /api/v1/notifications | Notifications | Access | Own data | Yes |
| ADMIN-DASH-API-001 | GET | /api/v1/admin/dashboard | Admin | Access | Any admin role (filtered) | Yes |
| ADMIN-CUST-API-001 | GET | /api/v1/admin/customers | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-CUST-API-002 | GET | /api/v1/admin/customers/{customer_id} | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-CUST-API-003 | GET | /api/v1/admin/customers/{customer_id}/orders | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-CUST-API-004 | GET | /api/v1/admin/customers/{customer_id}/requests | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-CUST-API-005 | GET | /api/v1/admin/customers/{customer_id}/projects | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-CUST-API-006 | POST | /api/v1/admin/customers/{customer_id}/deactivate | Admin | Access | SUPER_ADMIN | Yes |
| ADMIN-CAT-API-001 | GET | /api/v1/admin/products | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-002 | POST | /api/v1/admin/products | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-003 | PATCH | /api/v1/admin/products/{id} | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-004 | POST | /api/v1/admin/products/{id}/images | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-005 | GET | /api/v1/admin/categories | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-006 | POST | /api/v1/admin/categories | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CAT-API-007 | PATCH | /api/v1/admin/categories/{id} | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-ORD-API-001 | GET | /api/v1/admin/orders | Admin | Access | ORDER_MANAGER/SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-ORD-API-002 | GET | /api/v1/admin/orders/{order_id} | Admin | Access | ORDER_MANAGER/SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-ORD-API-003 | PATCH | /api/v1/admin/orders/{order_id}/status | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-ORD-API-004 | POST | /api/v1/admin/orders/{order_id}/notes | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-ORD-API-005 | POST | /api/v1/admin/orders/{order_id}/flag-cancellation | Admin | Access | ORDER_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-001 | GET | /api/v1/admin/manufacturing/requests | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-002 | GET | /api/v1/admin/manufacturing/requests/{id} | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-003 | POST | /api/v1/admin/manufacturing/requests/{id}/confirm-requirements | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-004 | POST | /api/v1/admin/manufacturing/requests/{id}/clarifications | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-005 | POST | /api/v1/admin/manufacturing/requests/{id}/status-update | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-006 | POST | /api/v1/admin/manufacturing/requests/{id}/complete-execution | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-007 | POST | /api/v1/admin/manufacturing/requests/{id}/complete | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-008 | GET | /api/v1/admin/manufacturing/cancellation-review-queue | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-MFG-API-009 | POST | /api/v1/admin/manufacturing/requests/{id}/resolve-cancellation | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-DESIGN-API-001..007 | (mirror ADMIN-MFG-API-001..007) | /api/v1/admin/design/requests/... | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-SW-API-001..007 | (mirror ADMIN-MFG-API-001..007) | /api/v1/admin/software/requests/... | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-001 | POST | /api/v1/admin/quotes | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-002 | PATCH | /api/v1/admin/quotes/{quote_id}/draft | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-003 | POST | /api/v1/admin/quotes/{quote_id}/send | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-004 | POST | /api/v1/admin/quotes/{quote_id}/revise | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-005 | GET | /api/v1/admin/quotes/{quote_id}/approvals | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-QUOTE-API-006 | POST | /api/v1/admin/quotes/{quote_id}/cancel | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CONSULT-API-001 | GET | /api/v1/admin/consultations[/{id}] | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CONSULT-API-002 | POST | /api/v1/admin/consultations/{id}/convert-to-quote | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CONSULT-API-003 | POST | /api/v1/admin/consultations/{id}/respond | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-CONSULT-API-004 | POST | /api/v1/admin/consultations/{id}/close | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-FILES-API-001 | GET | /api/v1/admin/requests/{request_type}/{request_id}/files | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-FILES-API-002 | POST | /api/v1/admin/requests/{request_type}/{request_id}/deliverables | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-FILES-API-003 | GET | /api/v1/admin/files/{file_id}/download | Admin | Access | MANUFACTURING_MANAGER/SUPER_ADMIN | Yes |
| ADMIN-REVIEW-API-001 | GET | /api/v1/admin/reviews | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-REVIEW-API-002 | POST | /api/v1/admin/reviews/{id}/hide | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-REVIEW-API-003 | POST | /api/v1/admin/reviews/{id}/restore | Admin | Access | SUPPORT_EXECUTIVE/SUPER_ADMIN | Yes |
| ADMIN-ANALYTICS-API-001 | GET | /api/v1/admin/analytics | Admin | Access | Role-scoped per `report` | Yes |
| ADMIN-ANALYTICS-API-002 | GET | /api/v1/admin/analytics/export | Admin | Access | Role-scoped per `report` | Yes |
| ADMIN-AUDIT-API-001 | GET | /api/v1/admin/audit-logs | Admin | Access | SUPER_ADMIN (all) / others (own) | Yes |

Every ID above corresponds to a specification given in Sections 6–49; no orphan rows exist.

---

## 83. Endpoint Specification Format — Documented Convention

Per the required format, every endpoint's specification covers: Purpose, Authentication, Authorization, Path/Query Parameters, Request Headers, Request Body, Validation Rules, Business Rules, Response, HTTP Status Codes, Error Responses, Idempotency, Rate Limiting, Side Effects, Database/State Changes, External Integrations, Related UI Screens, Related Product Requirements, and Acceptance Criteria.

**Documentation depth convention:** Sections 6, 11, 16–17, 21, 23, 29, 32–33, and 43–44 (authentication, checkout, payments/webhooks, manufacturing, clarification, files, quotes, and admin quote/manufacturing management) present this full format inline, since these are the endpoints carrying the platform's most critical business rules (INV-003, PAY-002, MFG-001, QUOTE-003) and benefit most from exhaustive, field-by-field specification. Simpler, structurally repetitive CRUD endpoints (addresses, categories, reviews, admin catalog management, and the Design/Software/Consultation endpoints that mirror Manufacturing's already-fully-specified pattern per Section 24's architectural decision) are documented in the more compact table format used in Sections 7, 8, 25–28, 35, 39–42, and 45–49, which still captures every one of the required fields (method, path, purpose, auth, authorization, request/response shape, and business rules) but without repeating an identical fifteen-field template dozens of times for endpoints that share one underlying pattern. Every field the full format requires is answered for every endpoint in this document — either inline in prose (critical endpoints) or via the combination of its table row plus the shared pattern description in Sections 21–24 and 43 (repetitive endpoints) — no endpoint is left with an unanswered requirement from the required format.

**Acceptance criteria**, specifically, are consolidated in Document 03 Section 52 (UI-level) and Sections 72–73 of this document (API-level: the testing contract and the seventeen critical integration tests) rather than restated per-endpoint, since a per-endpoint acceptance-criteria line would either restate the business rule already given (redundant) or restate the relevant integration test (also redundant) — Sections 72/73 are the authoritative, non-duplicated home for acceptance criteria across the entire API surface.

---

## 84. Complete Contract Examples

### Register
**Request:** `POST /api/v1/auth/register`
```json
{"email": "student@example.com", "password": "StrongPassword123!", "full_name": "Aarav Sharma", "phone": "+919812345678"}
```
**Response (201):**
```json
{"data": {"id": "3f1a1c0e-3b2d-4a4e-9c1a-1234567890ab", "email": "student@example.com", "full_name": "Aarav Sharma", "status": "registered", "created_at": "2026-09-05T10:15:00Z"}, "request_id": "req_a1b2c3"}
```

### Login
**Request:** `POST /api/v1/auth/login`
```json
{"email": "student@example.com", "password": "StrongPassword123!"}
```
**Response (200):**
```json
{"data": {"access_token": "eyJhbGciOiJIUzI1NiIs...", "token_type": "bearer", "expires_in": 900, "user": {"id": "3f1a1c0e-...", "email": "student@example.com", "full_name": "Aarav Sharma", "status": "verified"}}, "request_id": "req_d4e5f6"}
```

### Product Detail
**Request:** `GET /api/v1/products/b2e1c3a4-5f6d-4e7a-8b9c-0d1e2f3a4b5c`
**Response (200):**
```json
{
  "data": {
    "id": "b2e1c3a4-5f6d-4e7a-8b9c-0d1e2f3a4b5c",
    "name": "Arduino Uno R3",
    "description": "A microcontroller board based on the ATmega328P.",
    "specifications": [{"key": "Operating Voltage", "value": "5V"}, {"key": "Digital I/O Pins", "value": "14"}],
    "price": "1499.00",
    "currency": "INR",
    "stock_status": "in_stock",
    "image_urls": ["https://res.cloudinary.com/venopai/image/upload/uno_1.jpg"],
    "category_ids": ["cat-microcontrollers-uuid"]
  },
  "request_id": "req_g7h8i9"
}
```

### Add to Cart
**Request:** `POST /api/v1/cart/items`
```json
{"product_id": "b2e1c3a4-5f6d-4e7a-8b9c-0d1e2f3a4b5c", "quantity": 2}
```
**Response (200):**
```json
{"data": {"id": "cart-uuid", "items": [{"id": "item-uuid", "product_id": "b2e1c3a4-...", "name": "Arduino Uno R3", "unit_price": "1499.00", "quantity": 2, "line_total": "2998.00", "stock_warning": false}], "subtotal": "2998.00", "currency": "INR"}, "request_id": "req_j1k2l3"}
```

### Checkout (Session Creation)
**Request:** `POST /api/v1/checkout/sessions`
```json
{"address_id": "addr-uuid-1"}
```
**Response (201):**
```json
{
  "data": {
    "checkout_session_id": "sess-uuid-1",
    "items": [{"product_id": "b2e1c3a4-...", "name": "Arduino Uno R3", "quantity": 2, "unit_price": "1499.00"}],
    "address": {"id": "addr-uuid-1", "recipient_name": "Aarav Sharma", "city": "Hyderabad", "state": "Telangana", "pincode": "500001"},
    "reservation_expires_at": "2026-09-05T10:47:00Z",
    "shipping": {"rate": "60.00", "eta_days_min": 3, "eta_days_max": 5},
    "tax": {"type": "IGST", "amount": "245.82"},
    "subtotal": "2998.00",
    "total": "3303.82"
  },
  "request_id": "req_m4n5o6"
}
```

### Create Order (implicit, via verified payment — shown as the resulting Order, not a directly-called creation endpoint)
**Trigger:** verified success on `PAYMENT-API-002` following the session above.
**Resulting Order (`GET /api/v1/orders/{order_id}`) Response (200):**
```json
{
  "data": {
    "id": "ord-uuid-1",
    "order_number": "VNP-ORD-000123",
    "status": "paid",
    "payment_status": "successful",
    "items": [{"product_id": "b2e1c3a4-...", "name": "Arduino Uno R3", "unit_price": "1499.00", "quantity": 2, "line_total": "2998.00"}],
    "subtotal": "2998.00",
    "shipping_amount": "60.00",
    "tax": {"type": "IGST", "amount": "245.82"},
    "total": "3303.82",
    "shipping_address": {"id": "addr-uuid-1", "...": "..."},
    "shipment": null,
    "estimated_delivery": "2026-09-10",
    "created_at": "2026-09-05T10:33:10Z",
    "paid_at": "2026-09-05T10:33:10Z"
  },
  "request_id": "req_p7q8r9"
}
```

### Create Payment (Initiate)
**Request:** `POST /api/v1/payments/initiate`
```json
{"source_type": "checkout_session", "source_id": "sess-uuid-1"}
```
**Response (201):**
```json
{"data": {"payment_id": "pay-uuid-1", "razorpay_order_id": "order_LkjHDcpQr2s3t4", "amount": "3303.82", "currency": "INR", "key_id": "rzp_live_9abc12345"}, "request_id": "req_s0t1u2"}
```

### Payment Verification (Confirm)
**Request:** `POST /api/v1/payments/pay-uuid-1/confirm`
```json
{"razorpay_payment_id": "pay_MnO4pQr5S6t7", "razorpay_order_id": "order_LkjHDcpQr2s3t4", "razorpay_signature": "9f8e7d6c5b4a3210..."}
```
**Response (200):**
```json
{"data": {"payment_id": "pay-uuid-1", "status": "successful", "order_id": "ord-uuid-1"}, "request_id": "req_v3w4x5"}
```

### Manufacturing Request
**Request:** `POST /api/v1/manufacturing/requests`
```json
{
  "title": "Smart Energy Monitor Enclosure + PCB Assembly",
  "project_overview": "A small enclosed device that monitors household energy usage and reports over WiFi.",
  "prototype_type": "pcb_assembly",
  "quantity": 5,
  "technical_requirements": "Must fit a 60x40mm PCB, operate on 5V USB power.",
  "dimensions": {"length_mm": 80, "width_mm": 50, "height_mm": 25},
  "materials": "ABS plastic enclosure, FR4 PCB",
  "pcb_hardware_details": "2-layer PCB, through-hole components preferred",
  "manufacturing_requirements": "Matte black finish",
  "delivery_requirements": "Needed within 3 weeks if possible",
  "additional_notes": "",
  "file_ids": ["file-uuid-1"],
  "project_id": null
}
```
**Response (201):**
```json
{"data": {"id": "mfg-uuid-1", "title": "Smart Energy Monitor Enclosure + PCB Assembly", "status": "submitted", "quantity": 5, "files": {"customer_uploaded": [{"id": "file-uuid-1", "filename": "schematic_v1.pdf"}], "delivered": []}, "current_quote": null, "project_id": null, "created_at": "2026-09-06T08:00:00Z"}, "request_id": "req_y6z7a8"}
```

### Create Quote (Admin)
**Request:** `POST /api/v1/admin/quotes`
```json
{
  "request_type": "manufacturing",
  "request_id": "mfg-uuid-1",
  "line_items": [{"description": "PCB fabrication and assembly (x5)", "amount": "8500.00"}, {"description": "Enclosure manufacturing (x5)", "amount": "4200.00"}],
  "shipping_amount": "150.00",
  "estimated_timeline": "10-14 business days after payment",
  "valid_until": "2026-09-19T23:59:59Z",
  "terms": "Full payment required before production begins. 20% partial refund available if cancelled before materials are sourced."
}
```
**Response (201):**
```json
{"data": {"id": "quote-uuid-1", "request_type": "manufacturing", "request_id": "mfg-uuid-1", "current_version": {"version_number": 1, "status": "draft", "line_items": [...], "subtotal": "12700.00", "tax": {"type": "IGST", "amount": "2286.00"}, "shipping_amount": "150.00", "total": "15136.00", "valid_until": "2026-09-19T23:59:59Z"}}, "request_id": "req_b9c0d1"}
```

### Approve Quote
**Request:** `POST /api/v1/quotes/quote-uuid-1/approve`
**Response (200):**
```json
{"data": {"id": "quote-uuid-1", "current_version": {"version_number": 1, "status": "approved"}}, "request_id": "req_e2f3g4"}
```

### File Upload
**Request:** `POST /api/v1/files` (multipart/form-data: `file=<binary>`, `association_type=manufacturing`, `association_id=mfg-uuid-1`)
**Response (201):**
```json
{"data": {"id": "file-uuid-2", "filename": "revised_schematic.pdf", "content_type": "application/pdf", "size_bytes": 312456, "scan_status": "pending_scan", "created_at": "2026-09-06T09:00:00Z"}, "request_id": "req_h5i6j7"}
```

### Order Detail
Shown above under "Create Order."

### Admin Order Detail
**Request:** `GET /api/v1/admin/orders/ord-uuid-1`
**Response (200):**
```json
{
  "data": {
    "id": "ord-uuid-1",
    "order_number": "VNP-ORD-000123",
    "status": "paid",
    "payment_status": "successful",
    "customer": {"id": "3f1a1c0e-...", "email": "student@example.com", "phone": "+919812345678"},
    "items": [{"product_id": "b2e1c3a4-...", "name": "Arduino Uno R3", "unit_price": "1499.00", "quantity": 2, "line_total": "2998.00"}],
    "subtotal": "2998.00", "shipping_amount": "60.00", "tax": {"type": "IGST", "amount": "245.82"}, "total": "3303.82",
    "internal_notes": [],
    "shipping_address": {"...": "..."},
    "created_at": "2026-09-05T10:33:10Z"
  },
  "request_id": "req_k8l9m0"
}
```

### Error Example (Insufficient Stock)
**Request:** `POST /api/v1/checkout/sessions`
**Response (409):**
```json
{"error": {"code": "INSUFFICIENT_STOCK", "message": "The requested quantity is no longer available for one or more items.", "details": {"items": [{"product_id": "b2e1c3a4-...", "requested": 3, "available": 1}]}, "request_id": "req_n1o2p3"}}
```

---

## 85. Final API Contract

**VenopAI V1 API Contract**

The VenopAI API is a single versioned REST contract (`/api/v1/`) implemented as a FastAPI modular monolith, authenticated via JWT (short-lived bearer access tokens, rotating HTTP-only-cookie refresh tokens), consumed by the customer frontend, the admin frontend, and two external providers via webhook.

**Domains:** Auth, Users/Addresses, Catalog/Categories/Search, Cart, Checkout, Orders, Payments, Shipping, Manufacturing, Design, Software, Consultation, Projects, Files, Quotes, Reviews, Notifications, and a role-scoped Admin surface spanning every domain — each domain's endpoints owned by exactly one FastAPI module, with no cross-module data access.

**REST conventions:** plural resource nouns, UUID identifiers, ISO 8601 UTC timestamps, page-based pagination, an explicit per-resource filter/sort allow-list, and a single consistent error envelope carrying a stable machine-readable code and a correlation `request_id` on every response.

**Errors and status codes:** governed by one contract (Sections 54–55) applied without exception across every one of the endpoints in Section 82's inventory.

**Idempotency and concurrency:** required and enforced for every sensitive operation — order/payment creation, refunds, shipment creation, quote approval/revision — via a combination of `Idempotency-Key` support, database-level row locking, and optimistic version checks (Sections 56–57), so no double-charge, double-ship, oversell, or lost-update scenario is reachable through this API.

**RBAC:** every `/admin/*` endpoint is permission-gated server-side against the five fixed V1 roles (Section 58); every customer-facing endpoint enforces object-level ownership at the repository layer, returning `404` rather than confirming another customer's data exists (Section 59) — a hidden UI button is never the security boundary.

**External integrations:** Razorpay, Shiprocket, Cloudinary, and Resend are each accessed exclusively through a normalizing internal abstraction; no client of this API ever receives a raw provider response, a provider secret, or an unrestricted file-storage credential (Sections 62–65).

**Order/payment/shipping separation:** `Order.status`, `Payment.status`, and `Shipment.status` are three independently modeled, independently returned fields, never collapsed, throughout every endpoint that touches a commerce transaction (Sections 14–20).

**Quote versioning:** an approved `QuoteVersion` is permanently immutable and locked; any change creates a strictly new version, atomically superseding the prior one; approval/payment actions are structurally unreachable against any version except the current one (Sections 32–34, 66).

**Inventory safety:** stock is never reserved at cart-add time, only at checkout-session creation, for approximately 15 minutes, under row-level locking that makes overselling structurally impossible even under concurrent load (Sections 10–13).

**V1 boundaries:** no microservice-to-microservice APIs, no event bus, no AI/ML endpoints, no SMS/WhatsApp, no live-chat API, no Elasticsearch, no additional payment/shipping provider exposed as a client choice — exactly matching Documents 01–03, with every endpoint in this document traceable to a specific requirement, screen, and technical module, and no endpoint existing that isn't.

**This document is the authoritative API contract for VenopAI V1.**
