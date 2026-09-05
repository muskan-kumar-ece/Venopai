# 01 — Core Product Requirements

## VenopAI: Engineering Project Realization Platform

---

## 1. Document Control

| Field | Value |
|---|---|
| Document Title | VenopAI Core Product Requirements |
| Document ID | VNP-DOC-01 |
| Version | 1.0 — Authoritative V1 Product Requirements |
| Status | Approved for downstream use (foundation document) |
| Authority | Sole authoritative source for VenopAI product scope, behavior, and business rules for V1 |
| Purpose | Define what VenopAI is, what it must do, who it serves, and what governs its behavior, so that Documents 02–04 can be derived without inventing new functionality |
| Intended Audience | Product managers, software architects, backend engineers, frontend engineers, UI/UX designers, QA engineers, AI coding agents, future developers |
| Source Documents Reviewed | None — this is a new project with no prior documentation, architecture, codebase, or implementation to reconcile |
| Relationship to Other Documents | This is Document 01 of four. Document 02 (technical requirements and architecture), Document 03 (UI/UX and screen specification), and Document 04 (API contract specification) must all be derived from this document without contradicting it |
| Precedence Statement | Where any future document appears to conflict with this document on product scope, business rules, or workflow behavior, this document takes precedence unless formally revised |
| Change-Control Principle | Any change to a business rule, workflow, or V1 boundary defined here must be reflected as a version increment to this document before Documents 02–04 are updated to match. Silent divergence is not permitted |

---

## 2. Executive Product Definition

VenopAI is an **engineering project realization platform**. It exists to take a customer from an engineering need — however small or however ambitious — to a completed outcome, without forcing that customer to leave the platform or coordinate multiple unrelated vendors.

VenopAI is not a store that happens to sell electronics. It is a connected system in which:

- **Products** (components, kits, tools, accessories) can be discovered and purchased directly, and
- **Engineering services** (consultation, PCB/electronics design, custom manufacturing, software/firmware development) can be requested, scoped, quoted, approved, paid for, executed, and delivered,

within the same account, the same project context, and the same operational system.

**What VenopAI enables:** a student who needs a single resistor, a hobbyist who needs a complete project kit, and a hardware founder who needs a custom PCB manufactured and firmware written for it, all use the same platform — each getting a workflow appropriate to what they're buying.

**Target users:** engineering and electronics students, hobbyists, project builders, early-stage hardware innovators, and anyone requiring PCB/design work, manufacturing, or software/firmware support for an electronics or engineering project.

**Core value:** VenopAI removes the fragmentation inherent in engineering project work today — sourcing parts from one vendor, finding a PCB house separately, negotiating manufacturing informally, hunting for a freelancer for firmware, and tracking all of it across chats, emails, and spreadsheets. VenopAI centralizes requirement capture, file exchange, quotation, payment, and status tracking into one system.

**Differentiation:** VenopAI's differentiation is structural, not cosmetic. It is the only platform in this space that treats "buy a component" and "get a custom PCB manufactured" as two workflows inside one ecosystem, sharing one customer account, one notification system, one file store, and one administrative operations layer.

**Why product + engineering service integration matters:** Real engineering projects rarely stay in one lane. A customer who starts by buying a microcontroller often later needs a sensor, then a custom PCB, then help with firmware. If each of these requires a different platform, vendor, or communication channel, the customer bears the integration cost. VenopAI absorbs that cost by design.

---

## 3. Problem Statement

VenopAI exists to solve the following concrete problems:

- **PS-001 — Fragmented sourcing.** Electronics components, kits, and tools are sourced from multiple, inconsistent vendors with variable reliability, documentation, and support.
- **PS-002 — Difficulty finding appropriate kits.** Students and hobbyists struggle to find kits scoped correctly for their project or skill level, and lack a trusted place to buy them alongside individual components.
- **PS-003 — Fragmented project development.** A single project often spans component sourcing, design, manufacturing, and software — with no continuity between these phases today.
- **PS-004 — Difficulty getting engineering support.** Customers with an idea but limited expertise have no structured way to get design or consultation help.
- **PS-005 — Difficulty getting PCB/design work done.** PCB and circuit design services are difficult to access, request, and track for individuals and small projects.
- **PS-006 — Difficulty getting prototypes/manufacturing done.** Small-batch or one-off manufacturing is hard to source, quote, and track reliably.
- **PS-007 — Fragmented communication.** Requirement discussions happen over ad hoc channels (chat apps, email threads, phone calls) with no durable record.
- **PS-008 — Fragmented files.** Design files, schematics, CAD files, and deliverables are scattered across email attachments and personal drives, with no ownership or access control.
- **PS-009 — Fragmented quotations.** Quotes are issued informally, are not versioned, and are easily lost or disputed when requirements change.
- **PS-010 — Fragmented payments.** Payments for products and for services happen through inconsistent, often informal channels with weak reconciliation.
- **PS-011 — Lack of a unified project-realization workflow.** No single system currently lets a customer move from "I need a component" to "I need this project delivered" without switching platforms.

---

## 4. Target Users

### 4.1 Personas

**Engineering Students**
- Goals: complete academic or personal electronics projects on budget and on time.
- Common needs: individual components, project kits, occasional guidance.
- Major workflows: Direct Commerce (Mode A); occasionally Consultation.
- Relevant capabilities: Catalog, Search, Cart, Checkout, Reviews.

**Electronics Hobbyists**
- Goals: build personal projects, experiment, learn.
- Common needs: components, kits, tools; occasional custom PCB for a hobby project.
- Major workflows: Mode A regularly; Mode B (PCB/Design) occasionally.
- Relevant capabilities: Catalog, Cart, Checkout, PCB/Design request, Files, Quotes.

**Project Builders**
- Goals: deliver a specific working project (competition, personal milestone, freelance obligation).
- Common needs: kits, custom PCBs, sometimes manufacturing and firmware.
- Major workflows: Mode A and Mode B combined within a single project lifecycle.
- Relevant capabilities: full ecosystem — Catalog through Manufacturing and Software Services.

**Early-Stage Hardware Innovators**
- Goals: get from prototype to a small manufactured batch.
- Common needs: design consultation, PCB design, manufacturing, sometimes firmware.
- Major workflows: Mode B primarily, often multiple concurrent service requests.
- Relevant capabilities: Consultation, Design/PCB, Manufacturing, Quotes, Quote Versioning, Files.

**Customers Needing PCB/Design Services**
- Goals: convert a schematic or idea into a manufacturable design.
- Common needs: design review, PCB layout, design iteration.
- Major workflows: Mode B (Design), often followed by Manufacturing.
- Relevant capabilities: Design/PCB Services, Files, Quotes.

**Customers Needing Manufacturing**
- Goals: get a physical unit or small batch produced reliably.
- Common needs: manufacturing quote, execution tracking, delivery.
- Major workflows: Mode B (Manufacturing).
- Relevant capabilities: Manufacturing, Quotes, Quote Versioning, Shipping.

**Customers Needing Software/Firmware Support**
- Goals: get embedded software or supporting software written for their hardware.
- Common needs: scoped software request, deliverable files, revisions within scope.
- Major workflows: Mode B (Software Services).
- Relevant capabilities: Software Services, Files, Quotes.

### 4.2 Customer Lifecycle

`Discover → Register → Browse/Request → (Purchase | Request Service) → Track → Receive → Review → Return for the next project need`

No enterprise-only personas (procurement teams, multi-seat organizational accounts) are defined for V1; there is no source-derived or locked-direction basis for them.

---

## 5. Product Positioning

- **Vs. electronics ecommerce stores:** those stop at delivery of a product; VenopAI continues into design, manufacturing, and software when the customer's need goes beyond a purchasable item.
- **Vs. component marketplaces:** those aggregate listings without any service layer; VenopAI unifies commerce and services under one account and one operational system.
- **Vs. generic freelancer platforms:** those provide an open marketplace with variable quality and no structured product catalog; VenopAI provides a fixed, quality-controlled service intake (Consultation, Design, Manufacturing, Software) with a formal quote-and-approval workflow, not an open bidding marketplace.
- **Vs. generic software agencies:** those are software-only and disconnected from hardware sourcing; VenopAI's software service is scoped specifically to support hardware/electronics projects already in progress on the platform.
- **Vs. local engineering/manufacturing vendors:** those are informal, undocumented, and hard to discover or track; VenopAI formalizes requirement capture, quoting, and status tracking.

VenopAI's category is: **Engineering Project Realization Platform** — commerce and engineering services integrated into one ecosystem, built around the idea of a "project" rather than a "cart" alone.

---

## 6. Product Ecosystem

```
Customer
  │
  ├── Products (Direct Commerce)
  │     ├── Components
  │     ├── Kits
  │     ├── Tools
  │     └── Accessories
  │           │
  │           └── Cart → Checkout → Payment → Order → Shipping → Delivery → Review
  │
  └── Engineering Requirement (Engineering Services)
        │
        ├── Consultation
        ├── PCB / Electronics Design
        ├── Custom Manufacturing
        └── Software / Firmware Development
              │
              ▼
            Request Submitted (+ Project Files)
              │
              ▼
            Technical Review / Clarification
              │
              ▼
            Requirement Confirmed
              │
              ▼
            Quote Issued (versioned)
              │
              ▼
            Customer Approval ──(rejects)──▶ Revised Quote or Cancelled
              │
              ▼
            Payment
              │
              ▼
            Execution
              │
              ▼
            Delivery (+ Deliverable Files)
              │
              ▼
            Project Completion → Review
```

Both modes converge on the same **Customer Account** (orders, requests, quotes, files, notifications, reviews all live together) and the same **Admin Operations** layer (a single team operates both commerce and service fulfillment).

---

## 7. Product Modules

Each module below defines purpose, problem solved, primary users, capabilities, business rules, dependencies, V1 scope, and future considerations.

### 7.1 Authentication & Accounts
- **Purpose:** identify customers securely and persistently.
- **Problem solved:** account continuity across purchases and service requests.
- **Users:** all customers; administrators (separately, see 7.21).
- **Capabilities:** registration, login, email verification, password reset/recovery, profile management, address book management, account settings.
- **Business rules:** AUTH-001 Email must be verified before a customer can complete checkout or submit a service request. AUTH-002 Password reset requires a time-limited, single-use token. AUTH-003 A customer's session identity is required for all cart, checkout, order, and service-request actions.
- **Dependencies:** Notifications (email) for verification and reset.
- **V1 scope:** email/password authentication, email verification, password reset, profile, addresses.
- **Future considerations:** social login, multi-factor authentication.

### 7.2 Product Catalog
- **Purpose:** represent purchasable items.
- **Problem solved:** PS-001, PS-002.
- **Users:** customers (browse), administrators (manage).
- **Capabilities:** product listing, product detail (description, specifications, images, pricing, stock status), product variants where applicable, product status (active/inactive/discontinued).
- **Business rules:** CAT-001 Only active products are visible to customers. CAT-002 A product's displayed price is the single source of truth for cart and checkout calculation at the time of the action. CAT-003 Out-of-stock products remain visible but are not purchasable.
- **Dependencies:** Inventory, Categories, Search.
- **V1 scope:** full catalog CRUD (admin), full browse/detail (customer), basic variants (e.g., size/value) where the product type requires it.
- **Future considerations:** advanced configurable products, bundles beyond fixed kits.

### 7.3 Categories
- **Purpose:** organize the catalog for discovery.
- **Problem solved:** PS-001, PS-002.
- **Users:** customers, administrators.
- **Capabilities:** hierarchical categories (e.g., Components → Sensors), category browsing, category-based filtering.
- **Business rules:** CAT-010 A product may belong to one or more categories. CAT-011 A category with no active products is still visible unless hidden by an administrator.
- **Dependencies:** Product Catalog.
- **V1 scope:** category hierarchy up to two levels deep (category → subcategory).
- **Future considerations:** deeper nesting, dynamic/faceted category generation.

### 7.4 Search
- **Purpose:** let customers find products and, secondarily, understand available services.
- **Problem solved:** PS-001, PS-002.
- **Users:** customers.
- **Capabilities:** keyword search, filtering (category, price range, availability), sorting (relevance, price, newest), graceful no-result handling with suggestions.
- **Business rules:** SRCH-001 Search must operate over product name, description, and specification text. SRCH-002 A no-result search must present category suggestions rather than a dead end.
- **Dependencies:** Product Catalog, Categories.
- **V1 scope:** PostgreSQL-based full-text/trigram search. No dedicated search platform.
- **Future considerations:** Elasticsearch or equivalent if catalog scale requires it.

### 7.5 Cart
- **Purpose:** let a customer assemble a set of products before purchase.
- **Problem solved:** normal commerce usability.
- **Users:** customers.
- **Capabilities:** add/remove products, change quantity, live price calculation, persistence across sessions (for authenticated customers), transition to checkout.
- **Business rules:** CART-001 Adding a product to the cart does NOT reserve inventory. CART-002 Cart quantity is capped by currently available stock at the time of display, but is only authoritatively checked at checkout. CART-003 Cart contents persist for a logged-in customer across sessions.
- **Dependencies:** Product Catalog, Inventory (read-only check).
- **V1 scope:** single cart per customer; no saved/multiple carts.
- **Future considerations:** saved-for-later lists, multiple named carts.

### 7.6 Checkout
- **Purpose:** convert a cart into a paid order.
- **Problem solved:** PS-010 (in the commerce path).
- **Users:** customers.
- **Capabilities:** authenticated checkout, address selection/entry, shipping method and estimate display, tax calculation, final total display, payment initiation, order creation on confirmed payment.
- **Business rules:** CHK-001 Checkout requires an authenticated, verified customer. CHK-002 Checkout requires a valid, serviceable shipping address. CHK-003 Entering checkout triggers inventory reservation (see 7.8). CHK-004 An order is created only after payment is confirmed server-side (see 7.10).
- **Dependencies:** Cart, Addresses, Inventory, Shipping, Payments, Tax.
- **V1 scope:** single-address, single-shipment checkout for direct commerce orders.
- **Future considerations:** split shipments, multiple payment methods per order.

### 7.7 Addresses
- **Purpose:** store and reuse customer shipping addresses.
- **Problem solved:** checkout usability.
- **Users:** customers.
- **Capabilities:** add/edit/delete address, set default address, address validation (serviceability check via Shipping).
- **Business rules:** ADDR-001 A customer may store multiple addresses. ADDR-002 Address serviceability is checked at checkout time, not merely at save time.
- **Dependencies:** Shipping (serviceability).
- **V1 scope:** domestic (India) addresses only.
- **Future considerations:** international addresses.

### 7.8 Inventory
- **Purpose:** track sellable stock accurately.
- **Problem solved:** overselling, stock disputes.
- **Users:** administrators (manage), system (enforce).
- **Capabilities:** available quantity tracking, reserved quantity tracking, reservation creation/expiry, low-stock and out-of-stock states.
- **Business rules:** INV-001 Inventory has two conceptual quantities: **available** and **reserved**. INV-002 A reservation is created when a customer enters checkout with items in cart, not when items are added to cart. INV-003 A checkout reservation holds stock for **approximately 15 minutes**. INV-004 If checkout is not completed (payment confirmed) within the reservation window, the reservation expires and the stock returns to available. INV-005 A completed, paid order permanently decrements available stock and removes the reservation. INV-006 Two simultaneous reservations must not be able to oversell the same unit of stock.
- **Dependencies:** Cart, Checkout, Orders.
- **V1 scope:** single-warehouse, single-location stock model.
- **Future considerations:** multi-warehouse inventory, backorder support.

### 7.9 Orders
- **Purpose:** represent a confirmed, paid commerce transaction.
- **Problem solved:** PS-010, fulfillment tracking.
- **Users:** customers (view/track), administrators (manage/fulfill).
- **Capabilities:** order creation, order detail view, order status tracking, order history, invoice access.
- **Business rules:** ORD-001 An order is created only after payment confirmation (never before). ORD-002 Order status and payment status are tracked as separate concepts (see 7.10 and Section 22). ORD-003 A customer may request cancellation only while the order is in a pre-fulfillment state.
- **Dependencies:** Checkout, Payments, Inventory, Shipping.
- **V1 scope:** single order per checkout; no partial fulfillment.
- **Future considerations:** partial shipment/split fulfillment.

### 7.10 Payments
- **Purpose:** collect and verify payment for both orders and approved quotes.
- **Problem solved:** PS-010.
- **Users:** customers (pay), administrators (reconcile/refund), system (verify).
- **Capabilities:** payment initiation, payment status tracking, server-side verification via webhook/callback confirmation, refund initiation, payment history.
- **Business rules:** PAY-001 Razorpay is the sole V1 payment gateway. PAY-002 A frontend-reported "payment success" is never sufficient by itself; the system must receive and validate a server-side payment confirmation before treating payment as successful. PAY-003 Payment status (Pending / Successful / Failed / Refunded) is distinct from order status or quote status. PAY-004 Duplicate payment confirmations for the same transaction must not create duplicate orders or double-apply funds. PAY-005 For custom services, payment can only be initiated after the relevant quote is in the Approved state (see Section 11).
- **Dependencies:** Checkout (commerce path), Quotes (service path).
- **V1 scope:** Razorpay only; INR only.
- **Future considerations:** additional gateways, additional currencies.

### 7.11 Shipping
- **Purpose:** move physical products/deliverables to the customer.
- **Problem solved:** PS-010 (logistics), delivery transparency.
- **Users:** customers (track), administrators (create/manage shipments).
- **Capabilities:** serviceability check, shipping rate calculation, ETA calculation/display, shipment creation, tracking number/status, delivery confirmation, exception handling.
- **Business rules:** SHIP-001 Shiprocket is the sole V1 shipping provider. SHIP-002 The customer sees a calculated delivery estimate, never a hardcoded guaranteed date. SHIP-003 A shipment is created only after an order (commerce) or a paid/approved manufacturing request (service) is ready for dispatch. SHIP-004 If an address is found unserviceable at shipment-creation time, the order/request enters a Shipping Exception state requiring administrator intervention.
- **Dependencies:** Orders, Manufacturing (for physical deliverables), Addresses.
- **V1 scope:** domestic shipping via Shiprocket only.
- **Future considerations:** additional shipping aggregators, international shipping.

### 7.12 Manufacturing
- **Purpose:** deliver custom physical production (PCB fabrication/assembly, enclosures, prototypes, small-batch production) as a first-class service.
- **Problem solved:** PS-006, PS-011.
- **Users:** customers (request/track), administrators (review/execute).
- **Capabilities:** request submission with requirements and files, technical review, clarification exchange, requirement confirmation, quoting (with versioning), approval, payment, execution tracking, completion, delivery handoff to Shipping.
- **Business rules:** MFG-001 A manufacturing request cannot require or accept payment before a quote exists and is approved. MFG-002 If requirements change after a quote is issued, a new quote version must be created; the prior version becomes superseded. MFG-003 Once execution has begun, requirement changes require explicit administrator review before any new quote version affects the in-progress work. MFG-004 Cancellation before payment is always permitted by the customer. MFG-005 Cancellation after payment but before execution starts is permitted and triggers the Refund process. MFG-006 Cancellation after execution has started is subject to administrator review and may not be fully refundable, per the terms disclosed on the approved quote.
- **Dependencies:** Files, Quotes, Payments, Shipping.
- **V1 scope:** full request → quote → approval → payment → execution → delivery lifecycle for one active scope per request; structured status updates (not live production telemetry).
- **Future considerations:** capacity/scheduling automation, multi-vendor manufacturing routing.

### 7.13 PCB / Engineering Design Services
- **Purpose:** convert an idea, schematic, or rough requirement into a manufacturable design.
- **Problem solved:** PS-004, PS-005.
- **Users:** customers (request/review), administrators/engineers (design/deliver).
- **Capabilities:** design request submission (with reference files), scoping/clarification, quoting, approval, execution (design work), delivery of design files, and — where the customer opts in — handoff into a Manufacturing request.
- **Business rules:** DESIGN-001 A design request follows the same quote-before-payment rule as Manufacturing (MFG-001). DESIGN-002 Design deliverables are treated as Project Files owned by the customer once delivered and paid for.
- **Dependencies:** Files, Quotes, Payments; optionally Manufacturing.
- **V1 scope:** structured request intake, quoting, and delivery; not real-time collaborative CAD/EDA tooling.
- **Future considerations:** in-platform design review/annotation tools.

### 7.14 Consultation
- **Purpose:** give customers structured access to engineering guidance before or alongside a design/manufacturing/software request.
- **Problem solved:** PS-004.
- **Users:** customers (request), administrators/engineers (respond).
- **Capabilities:** structured consultation request (topic, description, optional files), asynchronous response/clarification thread, optional conversion into a quoted paid engagement, completion.
- **Business rules:** CONSULT-001 Consultation is asynchronous and structured in V1; no live chat or scheduling infrastructure is required. CONSULT-002 A consultation may be free-form/informational or may result in a quote if it converts into billable engineering work.
- **Dependencies:** Notifications, optionally Quotes.
- **V1 scope:** structured request/response thread per consultation.
- **Future considerations:** scheduled calls, live chat.

### 7.15 Software / Firmware Development
- **Purpose:** provide scoped software/firmware support tied to a customer's hardware project.
- **Problem solved:** PS-004, PS-011.
- **Users:** customers (request), administrators/engineers (deliver).
- **Capabilities:** request submission with requirements and reference files, clarification, quoting, approval, execution, delivery of software/firmware artifacts.
- **Business rules:** SW-001 Follows the same quote-before-payment rule as Manufacturing (MFG-001). SW-002 Software/firmware requests remain scoped to supporting an electronics/hardware project; VenopAI is not a general-purpose freelance software marketplace.
- **Dependencies:** Files, Quotes, Payments.
- **V1 scope:** structured request → quote → approval → payment → execution → delivery, same shape as Manufacturing/Design.
- **Future considerations:** ongoing maintenance/retainer engagements.

### 7.16 Project Files
- **Purpose:** hold all files exchanged in the course of a service engagement.
- **Problem solved:** PS-008.
- **Users:** customers (upload/download own files), administrators (access per role).
- **Capabilities:** upload (images, PDFs, schematics, CAD/STL/STEP/DXF, archives, deliverables), association with a specific request/project, private-by-default access control, download.
- **Business rules:** FILE-001 Files are private by default; visible only to the owning customer and administrators with relevant role access. FILE-002 Every file must be associated with a specific request/project context; unassociated uploads are not permitted. FILE-003 Uploaded files must be validated (type/size) and scanned for malicious content before being made available for download. FILE-004 A customer cannot access another customer's files under any circumstance.
- **Dependencies:** Manufacturing, Design, Software Services, Consultation.
- **V1 scope:** Cloudinary-backed storage (conceptual; implementation in Document 02), reasonable file-type and size limits.
- **Future considerations:** in-browser file preview/annotation for CAD/PCB formats.

### 7.17 Quotes
- **Purpose:** formalize pricing and scope for custom engineering work before any money changes hands.
- **Problem solved:** PS-009.
- **Users:** administrators/engineers (create), customers (review/approve/reject).
- **Capabilities:** quote creation with scope, pricing, applicable tax, applicable shipping, estimated timeline, validity period, and terms; sending to customer; approval/rejection; versioning on change; expiry.
- **Business rules:** QUOTE-001 A quote must exist and be Approved before any related payment can be initiated. QUOTE-002 A quote has a validity period; an unactioned quote past that period moves to Expired. QUOTE-003 An approved quote cannot be silently altered — any change requires a new version. QUOTE-004 Only the latest, non-superseded version of a quote may be approved or paid.
- **Dependencies:** Manufacturing, Design, Software Services; Payments.
- **V1 scope:** full quote lifecycle and versioning as defined in Section 11.
- **Future considerations:** automated/templated quote generation.

### 7.18 Reviews
- **Purpose:** capture customer feedback on products and completed services.
- **Problem solved:** trust and discovery quality.
- **Users:** customers (write), all visitors (read), administrators (moderate).
- **Capabilities:** 1–5 star rating, written review text, edit/delete by author within a permitted window, administrator moderation (hide/remove abusive or fraudulent reviews).
- **Business rules:** REV-001 A customer may review a product only after a delivered order containing that product (verified purchase). REV-002 A customer may review a service only after that service request reaches Completed. REV-003 A review may be moderated (hidden) by an administrator for abuse, but the review record is retained for audit.
- **Dependencies:** Orders, Manufacturing/Design/Software Services (for completion status).
- **V1 scope:** star rating + text, one review per completed order/service, moderation.
- **Future considerations:** review responses from VenopAI, photo/video reviews.

### 7.19 Notifications
- **Purpose:** keep customers informed of state changes without requiring them to poll the platform.
- **Problem solved:** transparency, reduced support burden.
- **Users:** customers (recipients), administrators (recipients for operational alerts, where applicable).
- **Capabilities:** transactional email for the events listed in Section 17.
- **Business rules:** NOTIF-001 Email is the sole V1 notification channel. NOTIF-002 Every state transition listed in Section 17 must trigger exactly one corresponding notification (no duplicates, no omissions).
- **Dependencies:** Resend (conceptual email provider), all modules that produce state transitions.
- **V1 scope:** email only.
- **Future considerations:** SMS, WhatsApp, in-app notification center, push notifications.

### 7.20 Customer Account
- **Purpose:** give the customer one place to see and manage everything they've done on VenopAI.
- **Problem solved:** PS-011.
- **Users:** customers.
- **Capabilities:** as defined in Section 19.
- **Business rules:** ACCT-001 A customer can only view their own orders, requests, quotes, files, payments, and reviews.
- **Dependencies:** all customer-facing modules.
- **V1 scope:** as defined in Section 19.
- **Future considerations:** project-level dashboards spanning multiple linked requests.

### 7.21 Admin Operations
- **Purpose:** let VenopAI staff run the business.
- **Problem solved:** operational control across a two-mode platform.
- **Users:** administrators (role-scoped).
- **Capabilities:** as defined in Section 20.
- **Business rules:** ADMIN-001 Every administrative action that changes customer-visible state must be attributable to a specific administrator account (see Audit History, 7.23).
- **Dependencies:** all modules.
- **V1 scope:** as defined in Section 20.
- **Future considerations:** configurable role permissions beyond the five fixed V1 roles.

### 7.22 Analytics
- **Purpose:** give administrators visibility into business and operational health.
- **Problem solved:** informed decision-making, workload visibility.
- **Users:** administrators.
- **Capabilities:** as defined in Section 28.
- **Business rules:** ANLY-001 Analytics are operational/business reporting, not a customer-facing feature in V1.
- **Dependencies:** Orders, Payments, Manufacturing, Quotes, Inventory.
- **V1 scope:** as defined in Section 28.
- **Future considerations:** predictive analytics, cohort analysis.

### 7.23 Audit / Operational History
- **Purpose:** maintain a durable record of significant state changes and administrative actions.
- **Problem solved:** accountability, dispute resolution.
- **Users:** administrators (view), system (write).
- **Capabilities:** event logging for order status changes, payment events, quote versioning/approval, manufacturing status changes, admin actions on customer-visible entities.
- **Business rules:** AUDIT-001 Audit records are immutable once written. AUDIT-002 Audit records must capture who (which administrator or "system"), what changed, and when.
- **Dependencies:** all modules producing state transitions.
- **V1 scope:** append-only event log covering the entities listed above.
- **Future considerations:** full field-level diffing across all entities.

---

## 8. Customer Experience

A customer's path through VenopAI is not linear — it is a set of entry and exit points around a shared account:

- **Discovery:** landing page, category browsing, search, or a direct link to a service (e.g., "Request Manufacturing").
- **Registration:** required before checkout or before submitting any service request; browsing and search are available unauthenticated.
- **Browsing/Search:** catalog exploration; service pages explaining Consultation, Design, Manufacturing, and Software offerings.
- **Product Purchase (Mode A):** add to cart → checkout → pay → track → receive → review.
- **Engineering Request (Mode B):** submit request (+ files) → clarify → review confirmed requirement → receive quote → approve → pay → track execution → receive delivery → review.
- **Exit points:** a customer may exit after any completed transaction and return later; the account persists all history so re-entry (e.g., starting a new manufacturing request after a prior product purchase) requires no re-onboarding.
- **Cross-over:** a customer may start in Mode A (buying components) and initiate a Mode B request (e.g., PCB design) from within the same account without re-registering, and vice versa.

---

## 9. Customer Journeys

### Journey A — Product Purchase
1. **Entry point:** product detail page or search result.
2. **Preconditions:** none to browse; authenticated + verified account to checkout.
3. **User actions:** add to cart, proceed to checkout, select/add address, confirm order summary, pay.
4. **System outcome:** inventory reserved at checkout entry; order created on confirmed payment; shipment created when ready.
5. **Important states:** Cart → Reserved → Paid → Processing → Shipped → Delivered.
6. **Failure scenarios:** reservation expiry (stock released, must restart checkout), payment failure (order not created), address unserviceable (must select another address).
7. **Notifications:** order confirmation, payment confirmation, shipment created, delivery.
8. **Exit condition:** delivery confirmed; customer may leave a review.

### Journey B — Product Kit Purchase
Follows Journey A exactly; a "kit" is a catalog product (7.2) composed of multiple components sold as a single SKU. No separate workflow is required.

### Journey C — Manufacturing Request
1. **Entry point:** "Request Manufacturing" action.
2. **Preconditions:** authenticated + verified account.
3. **User actions:** submit requirement description, upload relevant files, respond to clarification questions if raised.
4. **System outcome:** request enters technical review; once requirements are confirmed, a quote is generated and sent.
5. **Important states:** Submitted → Under Review → Clarification Needed → Requirement Confirmed → Quoted → Approved → Paid → In Execution → Completed → Delivered.
6. **Failure scenarios:** customer rejects quote (request may be revised or cancelled), quote expires unactioned, execution issue requires requirement renegotiation (new quote version).
7. **Notifications:** request received, clarification requested, quote issued, quote approved confirmation, payment confirmation, status updates, delivery.
8. **Exit condition:** delivery confirmed and request marked Completed; customer may review.

### Journey D — PCB/Design Request
Same shape as Journey C, scoped to design deliverables (schematics/PCB files) rather than physical production. May conclude with the customer initiating a follow-on Manufacturing request using the design deliverables as input files.

### Journey E — Consultation Request
1. **Entry point:** "Request Consultation."
2. **Preconditions:** authenticated + verified account.
3. **User actions:** describe the topic/question, optionally attach files.
4. **System outcome:** structured asynchronous response thread; may conclude as informational, or convert into a quoted engagement.
5. **Important states:** Submitted → In Progress → Responded → (optionally) Converted to Quote → Completed.
6. **Failure scenarios:** none billable unless converted; a stalled thread may be closed by an administrator after a defined inactivity period.
7. **Notifications:** request received, response posted, conversion to quote (if applicable).
8. **Exit condition:** thread marked Completed by customer or administrator.

### Journey F — Software/Firmware Request
Same shape as Journey C, scoped to software/firmware deliverables.

### Journey G — Quote Approval
1. **Entry point:** quote notification/link in customer account.
2. **Preconditions:** a quote exists in Sent or Viewed state.
3. **User actions:** review scope/pricing/terms, approve or reject, or request revision (which prompts a new version rather than approval).
4. **System outcome:** approval unlocks payment; rejection closes or reopens the request for renegotiation.
5. **Important states:** Sent → Viewed → Approved / Rejected.
6. **Failure scenarios:** quote expires before action; customer requests changes, producing Version 2 which supersedes Version 1.
7. **Notifications:** quote issued, quote approved confirmation, quote rejected confirmation, quote expiring soon (reminder).
8. **Exit condition:** quote reaches Approved (proceeds to Payment) or a terminal negative state (Rejected/Expired/Cancelled).

### Journey H — Payment
1. **Entry point:** checkout (commerce) or an Approved quote (service).
2. **Preconditions:** commerce — active reservation; service — Approved quote.
3. **User actions:** initiate payment via Razorpay, complete payment flow.
4. **System outcome:** payment status is set only after server-side verification of the gateway confirmation.
5. **Important states:** Payment Pending → Payment Successful / Payment Failed.
6. **Failure scenarios:** payment failure (retry allowed), payment abandoned (reservation/quote window may lapse), duplicate confirmation callback (must not double-process).
7. **Notifications:** payment confirmation or payment failure notice.
8. **Exit condition:** verified successful payment triggers order creation (commerce) or execution start (service).

### Journey I — Order Tracking
1. **Entry point:** order detail page in customer account.
2. **Preconditions:** an existing order.
3. **User actions:** view status, view shipment tracking once available.
4. **System outcome:** status reflects the latest synced shipment state.
5. **Important states:** Processing → Ready to Ship → Shipped → Delivered.
6. **Failure scenarios:** shipping exception (address issue, carrier delay) surfaced with guidance.
7. **Notifications:** shipment created, tracking updated, delivered.
8. **Exit condition:** delivery confirmed.

### Journey J — Project Completion
1. **Entry point:** final deliverable/delivery step of any service request.
2. **Preconditions:** execution finished and (for physical deliverables) shipped, or (for digital deliverables) uploaded to Project Files.
3. **User actions:** confirm receipt/acceptance, optionally leave a review.
4. **System outcome:** request status set to Completed; deliverable files remain accessible in the customer's account indefinitely.
5. **Important states:** Delivered → Completed.
6. **Failure scenarios:** customer disputes deliverable quality — routed to administrator support workflow (Section 21).
7. **Notifications:** completion confirmation.
8. **Exit condition:** Completed status reached; review eligibility unlocked.

---

## 10. Manufacturing Workflow

Manufacturing is a first-class VenopAI capability, not an ecommerce add-on.

**Stages:**

1. **Request** — customer submits requirements (description, quantity, specifications) and any reference files.
2. **Review** — an administrator/engineer evaluates feasibility.
3. **Clarification** — if requirements are ambiguous or incomplete, the system/administrator requests clarification; the request remains in Clarification Needed until the customer responds.
4. **Requirement Confirmation** — once scope is unambiguous, the request is marked Requirement Confirmed.
5. **Quote** — an administrator issues a Quote (Section 11) against the confirmed requirement.
6. **Customer Approval** — the customer approves or rejects. Approval is required before payment; rejection returns the request to Clarification or closes it, per customer choice.
7. **Payment** — enabled only after Approval (locked rule, restated below).
8. **Execution** — manufacturing work proceeds; status updates are posted by administrators as the work progresses (e.g., Materials Sourced, In Production, Quality Check).
9. **Completion/Delivery** — finished units are handed to Shipping (physical) and/or associated Project Files (documentation/certificates).
10. **Completion** — request marked Completed once delivery is confirmed.

**Payment timing:** MFG-001 (restated) — there is no direct payment path into Manufacturing before a quote exists and has been approved. This is a locked rule and must not be altered by any downstream document.

**Cancellation rules:**
- Before payment: customer may cancel freely at any time (MFG-004).
- After payment, before execution starts: customer may request cancellation; a refund process is triggered (MFG-005).
- After execution has started: cancellation requires administrator review and may be subject to partial refund per the terms stated on the approved quote (MFG-006).

**Requirement changes:**
- Before a quote is issued: requirements can be freely updated during Clarification.
- After a quote is issued but not yet approved: a requirement change invalidates the current quote draft and prompts a revised quote (new version).
- After approval/payment, before execution: a requirement change requires a new quote version; the customer must approve the new version before it takes effect, and the prior payment is reconciled (additional payment or partial refund as applicable) as an administrator-managed step.
- After execution has started: any requirement change goes through administrator review first (MFG-003) before a new quote version is even drafted, since work in progress may already be affected.

**Quote non-approval:** if the customer rejects a quote, the request either returns to Clarification for renegotiation or is closed by the customer; no payment obligation exists at any point prior to approval.

**Files:** all requirement documents and reference files are Project Files (7.16) associated with the specific manufacturing request; deliverable files/certificates are added to the same association upon completion.

**Status visibility to customer:** the customer sees the current stage (from the list above) and a plain-language description of what it means; internal administrator notes are not exposed to the customer.

---

## 11. Quote System

**Quote contents (conceptual):** scope description, itemized pricing, applicable tax, applicable shipping (if physical), estimated execution/delivery timeframe, validity period, terms and conditions, and any notes relevant to the customer.

**Lifecycle:**

```
Draft → Sent → Viewed → Approved → Payment Pending → Paid → Active
                     └──▶ Rejected
Sent/Viewed ──(unactioned past validity)──▶ Expired
Any pre-approval state ──(requirement changes)──▶ Superseded (new version created)
Draft/Sent/Viewed ──(customer or admin cancels)──▶ Cancelled
```

**Versioning (locked requirement):**
- A change to scope or pricing after a quote has been Sent produces a new version (e.g., Quote V2).
- The prior version transitions to Superseded and can no longer be approved or paid.
- Version history is retained and visible to the customer and administrators for traceability.
- **An already-Approved quote can never be silently modified.** Any change after approval requires a brand-new version that itself must go through Sent → Viewed → Approved again.

**Approval history:** every approval or rejection action is timestamped and attributed to the customer account that performed it, and is retained even after superseding.

**Relationship to payment:** payment can only be initiated against a quote version that is currently in the Approved state and has not been superseded (QUOTE-001, QUOTE-004).

**Relationship to cancellation:** a Draft, Sent, or Viewed quote may be cancelled by the customer or an administrator with no financial obligation. An Approved-and-Paid quote follows the Manufacturing/Design/Software cancellation rules (Section 10) rather than the quote cancellation path.

---

## 12. Commerce Business Rules

- **Pricing:** the price shown on the product detail page at the time of the cart/checkout action is authoritative; historical cart prices are not honored if the catalog price changes before checkout completes.
- **Stock:** available stock is checked when adding to cart (soft check) and re-verified at checkout entry (hard check, triggers reservation).
- **Cart:** does not reserve inventory (CART-001); is not authoritative for pricing beyond display.
- **Reservations:** created at checkout entry, held for ~15 minutes (INV-003), released automatically on expiry.
- **Checkout:** requires authenticated, verified customer, valid serviceable address, and available reserved stock.
- **Shipping:** rate and ETA calculated per shipment at checkout/quote time via Shiprocket; not fixed catalog attributes.
- **Tax:** calculated as a controlled business capability (Section 13); never hardcoded into product prices in this document.
- **Payment:** must be server-verified before order creation (PAY-002).
- **Order creation:** occurs only after payment confirmation (ORD-001).
- **Invoice:** generated upon order creation (commerce) or upon quote approval and payment (service), and made available in the customer account.
- **Cancellation:** permitted while an order is in a pre-fulfillment status (e.g., Pending Payment resolved as Paid but not yet Processing/Shipped); once Shipped, cancellation is not available and must be handled as a return/refund per administrator policy (outside V1 scope beyond basic refund handling).
- **Refund:** initiated by an administrator following a cancellation or dispute; reflected in Payment status as Refunded.
- **Fulfillment:** administrator-driven; order moves through Processing → Ready to Ship → Shipped based on operational action, not automatically.

---

## 13. Tax / GST Requirements

- **TAX-001** Every commerce order and every paid service engagement must have a determinable taxable amount for invoicing purposes.
- **TAX-002** The system must distinguish intra-state transactions (CGST + SGST applicable) from inter-state transactions (IGST applicable), based on the customer's shipping/billing state versus VenopAI's state of supply.
- **TAX-003** Whether displayed prices are tax-inclusive or tax-exclusive is a business configuration decision; this document does not lock a specific choice but requires that whichever is chosen, the customer sees a clear breakdown before payment.
- **TAX-004** Invoices must show the taxable value and the applicable tax breakdown (CGST/SGST or IGST) as line items.
- **TAX-005** Tax calculation itself (rates, rules) is implemented as a dedicated, centrally controlled business capability rather than duplicated logic across modules — this document does not specify the calculation method.

---

## 14. Shipping Requirements

- Shiprocket is the sole V1 shipping provider (SHIP-001).
- **Serviceability:** checked against the customer's address before it can be used at checkout or before a physical deliverable's shipment is created.
- **Shipping rate:** calculated per shipment (weight/dimensions/destination) rather than a flat catalog-level fee, using Shiprocket's rate capability.
- **ETA:** presented to the customer as a calculated estimate (e.g., "Arrives in 4–6 days"), never a guaranteed fixed date (SHIP-002).
- **Shipment creation:** occurs once an order/manufacturing request is ready for dispatch (SHIP-003).
- **Tracking:** a tracking reference is surfaced to the customer as soon as the carrier assigns one; status updates are synced periodically.
- **Delivery:** confirmed when the carrier marks the shipment delivered; this triggers the Delivered notification and unlocks review eligibility.
- **Exceptions:** an unserviceable address, failed delivery attempt, or lost shipment moves the shipment into a Shipping Exception state requiring administrator action (SHIP-004); the customer is notified and, where applicable, offered an address correction.

---

## 15. Payment Requirements

- Razorpay is the sole V1 payment gateway (PAY-001).
- **Initiation:** commerce — at checkout, after reservation and address/shipping confirmation; service — after quote approval.
- **Successful payment:** determined only by a verified server-side confirmation from Razorpay (webhook/callback validated against Razorpay's signature/verification mechanism), never by client-side redirect state alone (PAY-002).
- **Failed payment:** customer is notified and may retry; no order/execution is created.
- **Abandoned payment:** if a customer starts but never completes payment, the associated reservation (commerce) simply expires per INV-003–004, or the quote remains Approved-but-unpaid until the customer returns to pay or the quote's own validity expires.
- **Webhook confirmation:** treated as the authoritative event; any conflicting client-reported state is discarded in favor of the verified webhook outcome.
- **Refund:** initiated by an administrator; tracked as a distinct payment-status transition (Successful → Refunded), never a silent order deletion.
- **Reconciliation:** every order/quote has exactly one authoritative payment record per successful transaction; administrators must be able to see payment-to-order/quote linkage for reconciliation.
- **Order/payment separation:** restated as a core rule (ORD-002) — order status (fulfillment progress) and payment status (financial state) are tracked independently and must never be conflated into a single field.

---

## 16. Files & Project Documents

**Accepted file categories:** images, PDFs, circuit diagrams/schematics, PCB design files, CAD files, STL, STEP, DXF, project archives (ZIP), firmware/software source or binary archives, and finished deliverables of any of the above types.

- **Ownership:** the uploading customer owns files they upload; delivered files become owned by the customer upon delivery.
- **Access:** private by default (FILE-001); accessible only to the owning customer and administrators whose role covers that request type.
- **Association:** every file must belong to a specific request/project (FILE-002) — there is no general-purpose free-floating file storage.
- **Public/private classification:** all customer and deliverable files are private in V1; there is no mechanism for a customer to make a file publicly visible.
- **Upload validation:** file type and size are validated on upload; disallowed types are rejected with a clear reason.
- **Security expectations:** uploaded files are scanned for malicious content before being made downloadable (FILE-003); a failed scan blocks the file and notifies the customer to re-upload or contact support.
- **Download/access expectations:** only the owning customer and role-appropriate administrators can generate a download for a given file.
- **Lifecycle:** files persist for the life of the account; there is no automatic deletion policy defined in V1 (open question, see Section 34).

---

## 17. Notification Requirements

Email is the sole V1 channel (NOTIF-001). Required notification events:

| Event | Trigger |
|---|---|
| Account verification | Registration |
| Password reset | Reset request |
| Order confirmation | Payment verified (commerce) |
| Payment confirmation | Payment verified (commerce or service) |
| Payment failure | Verified failed payment attempt |
| Quote issued | Quote moves to Sent |
| Quote revised | New quote version sent |
| Quote approved | Customer approves a quote |
| Quote rejected | Customer rejects a quote |
| Manufacturing/Design/Software status change | Any stage transition in Section 10-style workflow |
| Shipment created | Shipment record created |
| Shipment tracking update | Carrier status change |
| Delivery | Carrier marks delivered |
| Service request update | Any customer-visible status change in Consultation/Design/Software |

No SMS or WhatsApp channel exists in V1 (locked exclusion).

---

## 18. Reviews

- **Who can review:** a customer with a delivered order (for products) or a Completed service request (for services).
- **Verified relationship:** REV-001/REV-002 — review eligibility is tied to an actual delivered/completed transaction; there is no open reviewing of products/services without a qualifying transaction.
- **Rating:** 1–5 stars, required.
- **Written review:** optional free text accompanying the rating.
- **Moderation:** administrators may hide a review for abuse/fraud; the underlying record is retained (REV-003), not deleted, for audit purposes.
- **Editing/deletion:** the authoring customer may edit or delete their own review within a defined window (e.g., before it is moderated or within a set number of days) — exact window is an implementation detail for Document 02/03, not locked here.
- **Visibility:** approved (non-moderated) reviews are visible to all visitors on the relevant product/service page.

---

## 19. Customer Account Requirements

The customer account provides a single place to view and act on everything associated with that customer:

- **Profile:** view/edit name, contact details, password.
- **Addresses:** manage saved addresses.
- **Orders:** list and detail view of all commerce orders, with status and tracking.
- **Invoices:** access to invoices for orders and paid quotes.
- **Payments:** history of payment attempts and outcomes.
- **Service Requests:** unified list of Consultation, Design, Manufacturing, and Software requests with current status.
- **Quotes:** list and detail of all quotes (including version history) tied to the customer's requests.
- **Project Files:** files the customer has uploaded and files delivered to them, organized by associated request.
- **Reviews:** reviews the customer has written, with edit access where still permitted.
- **Notifications:** a record of key notifications sent (email log view), not a separate in-app notification center in V1.
- **Settings:** account preferences (e.g., password change, notification email address).

A customer can only ever see their own data across every one of these views (ACCT-001).

---

## 20. Admin Operations Requirements

The Admin OS must let staff **run the business**, not just observe it. Required areas:

- **Customer management:** view customer accounts, order/request history, support context.
- **Catalog management:** create/edit/deactivate products and categories.
- **Inventory:** view/adjust stock, view reservations, resolve reservation conflicts.
- **Orders:** view, update status, manage cancellations/refund initiation.
- **Payments:** view payment records, reconcile, initiate refunds.
- **Shipments:** create/update shipments, resolve shipping exceptions.
- **Manufacturing:** manage the full request lifecycle (Section 10).
- **Quotes:** create, revise (new version), send, track approval status.
- **Consultations, Design Requests, Software Requests:** manage each request's lifecycle analogous to Manufacturing.
- **Project Files:** access files per role, upload deliverables.
- **Reviews:** moderate.
- **Notifications:** view send history/failures (operational visibility, not manual sending in V1).
- **Analytics:** view business/operational reporting (Section 28).
- **Audit Logs:** view the immutable history of significant actions.
- **Settings:** manage role assignments, business configuration such as tax registration details relevant to invoicing.

### Admin Roles

| Role | Responsibility | Accessible Domains | Key Restrictions |
|---|---|---|---|
| **SUPER_ADMIN** | Full operational and configuration authority | All domains | None within the platform; still subject to Audit logging |
| **MANUFACTURING_MANAGER** | Owns Manufacturing, Design, and Software request lifecycles | Manufacturing, Design, Software, Quotes, Project Files (for their requests) | Cannot manage payments/refunds directly, cannot manage catalog or customer accounts |
| **ORDER_MANAGER** | Owns commerce fulfillment | Orders, Inventory, Shipments, Catalog (read), Categories | Cannot issue quotes or manage service requests, cannot access financial reconciliation beyond order-linked payment status |
| **SUPPORT_EXECUTIVE** | First line of customer support | Customer management (read/limited write), Orders (read), Service Requests (read), Reviews (moderation) | Cannot alter pricing/quotes, cannot process refunds directly, cannot manage inventory or catalog |
| **FINANCE_MANAGER** | Owns payment and financial reconciliation | Payments, Refunds, Invoices, Analytics (financial) | Cannot manage catalog, inventory, or service execution |

---

## 21. Admin Operational Workflows

- **New order:** system creates order on verified payment → appears in Orders queue for ORDER_MANAGER → processed → shipment created → tracked to delivery.
- **Payment verification:** FINANCE_MANAGER monitors payment records flagged by mismatched or delayed webhook confirmation; escalates to Razorpay dashboard investigation as needed (manual/human intervention point).
- **Manufacturing request review:** MANUFACTURING_MANAGER reviews new submissions, raises clarification questions (human judgment required), confirms requirements.
- **Quote creation/revision:** MANUFACTURING_MANAGER (or role-equivalent for Design/Software) drafts pricing and scope; requires human judgment, not automated.
- **Shipment handling:** ORDER_MANAGER creates shipments and resolves exceptions; carrier-reported exceptions require human decision (e.g., contacting the customer for an address fix).
- **Refund handling:** FINANCE_MANAGER processes refunds triggered by cancellations or admin-approved disputes; always a manual authorization step.
- **Inventory correction:** ORDER_MANAGER adjusts stock counts to reflect physical reality (e.g., damaged goods); requires a reason to be logged.
- **Customer support:** SUPPORT_EXECUTIVE handles inbound queries, escalates pricing/scope questions to MANUFACTURING_MANAGER and payment questions to FINANCE_MANAGER.
- **Review moderation:** SUPPORT_EXECUTIVE or SUPER_ADMIN reviews flagged content and decides to hide/retain.

Human intervention is required at every point involving judgment: clarification questions, quote pricing, refund authorization, and shipping exception resolution. Purely mechanical transitions (payment webhook confirmation, reservation expiry, notification sending) are system-driven.

---

## 22. Status Models

### User
`Registered (unverified) → Verified → Active` ; `Active → Deactivated` (admin action). Terminal: Deactivated.

### Product
`Draft → Active → Inactive/Discontinued`. Terminal: Discontinued.

### Inventory (per SKU)
Tracks `Available` and `Reserved` quantities concurrently; no single-state lifecycle, but reservations individually move `Reserved → Released` (expiry) or `Reserved → Consumed` (order paid).

### Cart
`Empty → Active → Converted (to checkout)` or `Abandoned` (no terminal enforcement; carts don't expire in V1).

### Order
`Pending Payment → Paid → Processing → Ready to Ship → Shipped → Delivered → Completed`. Alternate: `Pending Payment → Payment Failed` (no order created); `Paid/Processing → Cancelled` (pre-shipment only); `Shipped → Shipping Exception → (resolved) Shipped/Delivered`. Terminal: Completed, Cancelled.

### Payment
`Pending → Successful` or `Failed`. `Successful → Refunded` (post-cancellation). Terminal: Successful (if not refunded), Failed, Refunded.

### Shipment
`Created → In Transit → Out for Delivery → Delivered`. Alternate: `→ Exception → (resolved) In Transit/Delivered` or `→ Returned`. Terminal: Delivered, Returned.

### Manufacturing Request (and equivalently Design / Software requests)
`Submitted → Under Review → Clarification Needed → Requirement Confirmed → Quoted → Approved → Payment Pending → Paid → In Execution → Completed → Delivered → Completed(final)`. Alternate: `Quoted → Rejected`; `Quoted → Expired`; any pre-payment state `→ Cancelled`; `Paid/In Execution → Cancellation Requested → (admin review) → Cancelled or continues`. Terminal: Completed, Cancelled, Rejected (if not renegotiated), Expired (if not renegotiated).

### Quote
`Draft → Sent → Viewed → Approved` or `Rejected`. Alternate: `Sent/Viewed → Expired`; any pre-approval state `→ Superseded` (new version created) or `→ Cancelled`. Terminal: Approved-and-Paid (transitions ownership to the request), Rejected, Expired, Superseded, Cancelled.

### Consultation (Service Request)
`Submitted → In Progress → Responded → Completed`. Alternate: `→ Converted to Quote` (then follows Quote/Manufacturing-equivalent lifecycle) or `→ Closed` (inactivity). Terminal: Completed, Closed.

### Review
`Submitted → Visible` or `Hidden` (moderation). Terminal: Visible, Hidden (both retained for audit).

No transition skips a required intermediate state (e.g., an Order cannot move directly from Pending Payment to Shipped; a Manufacturing Request cannot move directly from Submitted to Paid).

---

## 23. Business Rules

This section centralizes every locked business rule referenced throughout this document.

**Authentication**
- AUTH-001 Email verification required before checkout or service-request submission.
- AUTH-002 Password reset tokens are time-limited and single-use.

**Products**
- CAT-001 Only active products are customer-visible.
- CAT-002 Displayed price at time of action is authoritative.

**Cart**
- CART-001 Cart addition never reserves inventory.

**Inventory**
- INV-001–006 Available/reserved quantity model; reservation created at checkout entry; ~15-minute reservation window; expiry releases stock; paid order permanently decrements stock; no overselling across concurrent reservations.

**Checkout**
- CHK-001–004 Requires verified account, valid serviceable address, triggers reservation, order created only post-payment.

**Payment**
- PAY-001–005 Razorpay only; server-side verification is authoritative; payment status independent of order/quote status; no duplicate processing; service payment gated by Approved quote.

**Order**
- ORD-001–003 Order created only post-payment; order/payment status separation; cancellation only pre-fulfillment.

**Manufacturing (and Design/Software by extension)**
- MFG-001–006 No payment before quote approval; requirement changes after quoting require new quote version; in-progress work changes require admin review first; cancellation rules vary by payment/execution stage.

**Quote**
- QUOTE-001–004 Approval required before payment; validity/expiry; no silent modification of an approved quote; only latest non-superseded version is actionable.

**Files**
- FILE-001–004 Private by default; must be associated with a specific request; validated and malware-scanned; no cross-customer access.

**Shipping**
- SHIP-001–004 Shiprocket only; calculated estimate, not guaranteed date; shipment created only when ready; unserviceable address triggers exception handling.

**Reviews**
- REV-001–003 Verified-transaction eligibility only; moderation retains the record.

**Admin**
- ADMIN-001 Every state-changing admin action is attributable and logged.

**Notifications**
- NOTIF-001–002 Email-only channel; every listed transition triggers exactly one notification.

**Audit**
- AUDIT-001–002 Immutable, attributable log entries.

---

## 24. Error & Exception Behavior

| Scenario | Product-Level Behavior |
|---|---|
| Insufficient stock at checkout | Checkout blocked for the affected line item; customer prompted to adjust quantity or remove item |
| Payment failure | Customer notified; no order created; retry offered |
| Payment timeout | Treated as failure once the gateway's own timeout is reached; reservation may still be held until its own expiry |
| Duplicate payment callback | Second confirmation for an already-processed transaction is discarded; no duplicate order/state change |
| Shipping unavailable (unserviceable) | Customer blocked at checkout with that address; prompted to choose/add another |
| Invalid address / invalid PIN | Rejected at entry with a clear validation message before it can be used at checkout |
| Quote expiry | Quote moves to Expired; customer must request a new quote to proceed |
| Quote rejection | Request returns to Clarification (if renegotiation is desired) or is closed |
| Manufacturing cancellation (various stages) | Handled per MFG-004–006 depending on payment/execution stage |
| File upload failure (validation/malware) | Upload rejected with a specific reason; customer prompted to re-upload |
| Unauthorized action | Blocked; customer/administrator sees an access-denied outcome, no partial state change occurs |
| Service unavailable (e.g., gateway/shipping provider down) | Customer-facing action is blocked with a clear "try again later" message; no partial order/payment state is created |
| Duplicate request submission (e.g., accidental double-submit) | System must recognize and prevent creation of duplicate requests/orders from a single user action |

---

## 25. Security & Trust Requirements

- **SEC-001** All customer-facing actions that touch personal data, orders, payments, or files require an authenticated session.
- **SEC-002** Email verification is required before any transaction (commerce or service) can be completed.
- **SEC-003** Project files are private by default and access-controlled per FILE-001–004.
- **SEC-004** Payment handling relies on Razorpay's secure flow; VenopAI does not store raw payment credentials.
- **SEC-005** Administrator access is role-restricted per Section 20; no administrator has access beyond their role's defined domains except SUPER_ADMIN.
- **SEC-006** Every significant state-changing action (admin or system) is captured in the Audit History.
- **SEC-007** Uploaded files must be scanned for malicious content before being made available for download (restated from FILE-003).
- **SEC-008** Customer personal information (contact details, addresses) is visible only to the customer and to administrators whose role requires it.
- **SEC-009** Invoices and delivered/paid deliverables are accessible only to the owning customer and role-appropriate administrators, mirroring file access rules.

---

## 26. Data & Information Requirements

| Entity | Why It Exists | Who Uses It | Business Relationship |
|---|---|---|---|
| Customer | Identifies the person transacting | Customer, all admin roles | Owns orders, requests, files, payments, reviews |
| Product | Represents a purchasable item | Customer, Order Manager | Belongs to Categories; appears in Cart/Orders |
| Category | Organizes the catalog | Customer, Order Manager | Groups Products |
| Cart | Holds pre-purchase selections | Customer | Converts into Checkout/Order |
| Inventory | Tracks sellable stock | Order Manager, system | Constrains Cart/Checkout/Order |
| Order | Represents a confirmed commerce transaction | Customer, Order Manager, Finance Manager | Produced by Checkout + Payment; drives Shipment |
| Payment | Represents a financial transaction | Customer, Finance Manager | Linked to exactly one Order or one Approved Quote |
| Shipment | Represents physical movement of goods | Customer, Order Manager | Linked to an Order or a completed Manufacturing/Design request |
| Manufacturing Request | Represents a custom production engagement | Customer, Manufacturing Manager | Produces Quotes, consumes/produces Files |
| Service Request (Design/Software/Consultation) | Represents a non-manufacturing engineering engagement | Customer, Manufacturing Manager | Same structural relationship as Manufacturing Request |
| Quote | Formalizes pricing/scope for a service engagement | Customer, Manufacturing Manager, Finance Manager | Belongs to exactly one Service/Manufacturing Request; versioned |
| Quote Version | Preserves quote history | Customer, Manufacturing Manager | Chained to prior version; only latest is actionable |
| Project | Conceptual grouping of related requests/files for a customer's effort (not a separate transactional entity in V1 beyond this grouping) | Customer | Groups related Manufacturing/Design/Software requests where the customer links them |
| File | Represents an uploaded or delivered artifact | Customer, role-appropriate admins | Associated with exactly one request/project |
| Review | Captures customer feedback | Customer, Support Executive | Linked to a delivered Order or Completed Request |
| Notification | Represents a sent communication | System, administrators (visibility) | Triggered by entity state transitions |
| Admin User | Identifies platform staff | All admin roles | Performs role-scoped actions, generates Audit entries |
| Audit Event | Immutable record of a significant action | Administrators | References the acting Admin User (or "system") and the affected entity |

Full database schemas are intentionally excluded; they belong to Document 02.

---

## 27. Search & Discovery

- **Product search:** operates over product name, description, and specification fields.
- **Categories:** browsable independently of search, up to two levels deep (Category → Subcategory).
- **Filters:** category, price range, availability (in stock / out of stock).
- **Sorting:** relevance (default for keyword search), price (low-high/high-low), newest.
- **Relevance:** V1 uses PostgreSQL's native text-search/trigram capability rather than a dedicated search platform (locked exclusion of Elasticsearch).
- **Empty results:** a no-result search must show related category suggestions rather than a dead end.
- **Search UX expectation:** results should return quickly enough to feel interactive for a catalog of realistic V1 scale; this document does not set a numeric latency target (technical target belongs in Document 02).

---

## 28. Analytics Requirements

Administrators need visibility into:

- **Orders:** volume, status breakdown, average order value.
- **Revenue:** commerce revenue vs. service revenue, by period.
- **Customers:** new vs. returning, active accounts.
- **Product performance:** best/worst sellers, stock turnover.
- **Inventory:** current available/reserved levels, low-stock alerts.
- **Manufacturing/service requests:** volume by stage, average time-in-stage.
- **Quote conversion:** quotes sent vs. approved vs. rejected vs. expired.
- **Payments:** success/failure rates, refund volume.
- **Operational workload:** open requests per admin role, backlog size.

This is business/operational reporting for internal use; it is not a customer-facing feature and does not require a dedicated data warehouse in V1.

---

## 29. V1 Scope Matrix

| Domain | V1 | Later | Notes |
|---|---|---|---|
| Authentication & Accounts | Yes | MFA, social login | Email/password + verification only |
| Product Catalog | Yes | Configurable products | Includes kits as fixed-composition SKUs |
| Categories | Yes | Deep nesting | Two levels in V1 |
| Search | Yes (PostgreSQL) | Elasticsearch | No dedicated search platform |
| Cart | Yes | Multiple/saved carts | Single cart per customer |
| Checkout | Yes | Split shipments | Single address/shipment |
| Addresses | Yes | International addresses | Domestic only |
| Inventory | Yes | Multi-warehouse | Single location, reservation model |
| Orders | Yes | Partial fulfillment | Single order per checkout |
| Payments | Yes (Razorpay) | Additional gateways | INR only |
| Shipping | Yes (Shiprocket) | Additional aggregators | Domestic only |
| Manufacturing | Yes | Multi-vendor routing | Core differentiator |
| PCB/Design Services | Yes | In-platform CAD tools | Structured request/deliverable model |
| Consultation | Yes | Live chat, scheduling | Asynchronous/structured only |
| Software/Firmware Services | Yes | Retainers | Scoped, hardware-project-tied |
| Project Files | Yes | In-browser preview | Private, request-associated |
| Quotes | Yes | Automated quote generation | Full versioning included |
| Quote Versioning | Yes | — | Locked requirement |
| Reviews | Yes | Photo/video reviews | Verified-transaction only |
| Notifications | Yes (email only) | SMS, WhatsApp, push | Locked exclusion of other channels |
| Customer Account | Yes | Cross-request project dashboards | — |
| Admin Operations | Yes | Configurable RBAC | Five fixed roles |
| Analytics | Yes (operational) | Predictive analytics | No data warehouse |
| Audit History | Yes | Field-level diffing | Event-level logging |
| Native mobile apps | No | Possible future | Web only in V1 |
| Live chat | No | Possible future | — |
| Elasticsearch | No | Possible future | — |
| Microservices architecture | No | Not planned as a near-term need | Modular monolith direction (Document 02) |

---

## 30. Out of Scope

The following are explicitly excluded from V1:

- Microservices architecture
- Kubernetes
- Multi-region infrastructure
- Multiple payment gateways
- Multiple shipping aggregators
- Elasticsearch or any dedicated search platform
- Native mobile applications
- SMS notification infrastructure
- WhatsApp notification infrastructure
- Live chat infrastructure
- Complex real-time collaboration tooling
- Advanced/machine-learning recommendation engine
- Enterprise-scale observability infrastructure
- Unnecessary automation of judgment-requiring workflows (clarification, quoting, refund approval)
- Premature marketplace mechanics (open bidding, multiple competing vendors per request)

**Why deferred:** each of these adds infrastructure cost, operational complexity, or legal/compliance surface area that is not justified until VenopAI has validated its core workflow (commerce + quote-based engineering services) with a real customer base. Introducing them prematurely would slow delivery of the core differentiator without corresponding customer benefit at V1 scale.

---

## 31. Future Roadmap Direction

The following are logical future expansion categories, explicitly **not** V1 requirements:

- Additional payment providers (beyond Razorpay)
- Additional shipping providers (beyond Shiprocket)
- Native mobile applications (iOS/Android)
- Advanced AI-assisted engineering guidance
- Advanced/faceted search (potentially Elasticsearch)
- Workflow automation for routine clarification/quoting patterns
- Real-time collaboration on design files
- Broader marketplace capabilities (e.g., multiple manufacturing vendors)
- Advanced project management tooling spanning multiple linked requests

---

## 32. Product Acceptance Criteria

**Product Purchase**
1. Customer can discover a product via browse/search.
2. Customer can view full product detail.
3. Customer can add the product to cart.
4. Customer can proceed to checkout.
5. Customer can select or add a serviceable address.
6. Customer sees a calculated shipping estimate and final total (incl. tax).
7. Customer can initiate and complete payment.
8. System creates the order only after verified payment.
9. Customer receives order confirmation.
10. Shipment is created and tracking becomes available.
11. Customer receives delivery confirmation.
12. Customer can leave a review post-delivery.

**Manufacturing / Design / Software Services**
1. Customer can submit a request with a description and files.
2. Customer can respond to clarification questions.
3. Customer sees the request move to Requirement Confirmed.
4. Customer receives a quote with clear scope and pricing.
5. Customer can approve or reject the quote.
6. Payment can only be initiated after approval.
7. Customer can track execution status through defined stages.
8. Customer receives delivery (physical via Shipping and/or digital via Project Files).
9. Request reaches Completed and the customer can leave a review.
10. If requirements change post-quote, a new quote version is created and must be separately approved.

**Consultation**
1. Customer can submit a consultation request.
2. Customer receives a response.
3. Customer can see if/when the consultation converts into a quoted engagement.
4. Consultation reaches Completed or Closed.

**Admin Operations**
1. An administrator can only access domains permitted by their role.
2. Every state-changing admin action produces an audit entry.
3. An administrator can create and revise (version) a quote.
4. An administrator can process a refund tied to a specific payment record.
5. An administrator can resolve a shipping exception.

---

## 33. Traceability

```
Product Requirement (this document, Section 7/9/10/11)
   ↓
Technical Requirement & Architecture (Document 02)
   — realizes each module's capabilities and business rules as backend/data-layer design
   ↓
UI/UX & Screen Specification (Document 03)
   — realizes each customer journey (Section 9) and admin workflow (Section 21) as concrete screens
   ↓
API Contract Specification (Document 04)
   — realizes each business rule (Section 23) and state transition (Section 22) as concrete request/response contracts
   ↓
Acceptance Test (derived from Section 32)
```

Example domain-level trace (illustrative, not exhaustive):
`MFG-001 (no payment before quote approval) → Manufacturing module data model + status guard (Doc 02) → Quote approval screen + payment-gated UI state (Doc 03) → Payment-initiation endpoint rejects unapproved-quote requests (Doc 04) → Acceptance test: "payment cannot be initiated against a non-Approved quote"`

---

## 34. Open Questions / Controlled Assumptions

| Question | Why It Matters | Proposed Default | Decision Required? |
|---|---|---|---|
| Are prices displayed tax-inclusive or tax-exclusive? | Affects checkout UI and invoice presentation | Tax-exclusive display with tax shown as a separate line at checkout | Yes |
| Exact review edit/delete window (e.g., 7 days, or until moderated) | Affects UI and API contract | 7 days from submission, or until an admin moderates it, whichever is sooner | Yes |
| File retention/deletion policy (indefinite vs. time-limited) | Affects storage cost and customer expectations | Retain indefinitely for the life of the account in V1; revisit if storage cost becomes material | Yes |
| Consultation inactivity auto-close threshold | Affects support workload and customer experience | Auto-close after 14 days of customer inactivity, with a reminder notification at day 10 | Yes |
| Whether a "Project" is a first-class entity linking multiple requests, or purely conceptual in V1 | Affects account UI and data model | Conceptual only in V1 (customer sees related requests grouped by shared context they specify); not a separate transactional entity | Yes |
| Refund percentage/policy once manufacturing execution has started | Affects customer trust and finance operations | Case-by-case administrator determination disclosed in the approved quote's terms; no fixed percentage locked in V1 | Yes |
| Maximum file upload size and total per-request storage limit | Affects infrastructure cost and UX | Reasonable default (e.g., 100MB per file) proposed for Document 02 to finalize | Yes |
| Domestic-only address scope — is this a hard V1 constraint or a near-term default? | Affects checkout/address validation logic | Hard V1 constraint (India only) | No — already locked by source direction |

---

## 35. Final V1 Product Contract

**VenopAI V1 Product Contract**

VenopAI is an **engineering project realization platform** that combines direct commerce (components, kits, tools, accessories) with quote-based engineering services (consultation, PCB/electronics design, custom manufacturing, and software/firmware development) inside a single customer account and a single administrative operations system.

**Who it serves:** engineering students, electronics hobbyists, project builders, and early-stage hardware innovators who need anything from a single component to a fully realized, manufactured, and software-equipped project.

**Core modules:** Authentication & Accounts, Product Catalog, Categories, Search, Cart, Checkout, Addresses, Inventory, Orders, Payments, Shipping, Manufacturing, PCB/Design Services, Consultation, Software/Firmware Services, Project Files, Quotes (with versioning), Reviews, Notifications, Customer Account, Admin Operations, Analytics, Audit History.

**Critical workflows:** Direct Commerce (`Browse → Cart → Checkout → Payment → Order → Shipping → Delivery → Review`) and Engineering Services (`Request → Review/Clarification → Requirement Confirmed → Quote → Approval → Payment → Execution → Delivery → Completion → Review`) are structurally distinct and must remain so.

**Payment model:** Razorpay only; server-verified confirmation is the sole source of truth for payment success; for services, payment is impossible before quote approval.

**Manufacturing model:** request-driven, quote-gated, versioned on any requirement or scope change, with cancellation rules that vary by payment/execution stage.

**Shipping model:** Shiprocket only; delivery estimates are calculated, never guaranteed.

**Notification model:** email only.

**Admin model:** five fixed roles (SUPER_ADMIN, MANUFACTURING_MANAGER, ORDER_MANAGER, SUPPORT_EXECUTIVE, FINANCE_MANAGER), each scoped to specific operational domains, with every state-changing action logged in an immutable audit trail.

**V1 boundaries:** no microservices, no Kubernetes, no multi-region infrastructure, no additional payment/shipping providers, no Elasticsearch, no native mobile apps, no SMS/WhatsApp, no live chat, no advanced AI/ML systems. A modular, budget-conscious, production-capable build is the goal — not a maximally scalable one.

**Architectural independence of this document:** this document defines *what* VenopAI is and must do. It intentionally contains no database schemas, no API endpoints, no React components, no FastAPI code, and no infrastructure configuration. Documents 02 (technical architecture), 03 (UI/UX and screens), and 04 (API contracts) must be built to satisfy every requirement and business rule stated here, and must not introduce product capabilities, workflows, or business rules that contradict it.

**This document is the authoritative V1 product contract for VenopAI.**
