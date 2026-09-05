# 03 — UI/UX & Screen Specification

## VenopAI V1 UI/UX & Screen Specification

---

## 1. Document Control

| Field | Value |
|---|---|
| Document Title | VenopAI V1 UI/UX & Screen Specification |
| Document ID | VNP-DOC-03 |
| Version | 1.0 |
| Status | Approved for downstream use (foundation for Document 04 and implementation) |
| Authority | Sole authoritative source for VenopAI's screens, navigation, UI states, and design system for V1 |
| Purpose | Translate Documents 01 and 02 into a screen-by-screen interface specification detailed enough to design, build, test, and review without inventing new product functionality |
| Intended Audience | UI designers, frontend engineers, UX researchers, QA engineers, AI coding agents, product managers |
| Source Documents | `01-core-product-requirements.md` (VNP-DOC-01), `02-technical-requirements-and-architecture.md` (VNP-DOC-02) |
| Relationship to Documents 01 and 02 | This document implements the product (Doc 01) using the technical capabilities and constraints established in Doc 02. It introduces no product capability Doc 01 does not authorize and assumes no backend capability Doc 02 does not provide |
| Precedence Rules | Where this document conflicts with Doc 01 on product behavior/business rules, Doc 01 prevails. Where it conflicts with Doc 02 on what the backend can technically support, Doc 02 prevails. Internal conflicts resolve in favor of the more specific section |

---

## 2. UX Executive Summary

VenopAI's interface has one job above all others: make an unusually broad platform (buy a resistor, get a PCB manufactured, hire firmware help) feel like **one coherent place**, not three products bolted together.

- **Commerce experience** feels like a clean, fast, no-nonsense component/kit store — comparable in speed and clarity to any competent ecommerce site, but restrained rather than flashy (Section 7 principles: practical over decorative).
- **Engineering/service experience** feels structured and professional — closer to a project-intake system than a marketplace listing. Every request has a visible, honest status; nothing pretends to be more automated or more "live" than it actually is (V1 is asynchronous by design, per Doc 01 Sections 7.14, 10, 11).
- **Project experience** is the connective tissue: a customer's account shows commerce and services side by side, and a service request can visibly point back to files or context from an earlier request, without a heavyweight "project management" UI Doc 01 does not require.
- **Account experience** is the single place a customer returns to for anything: orders, requests, quotes, files, invoices, reviews — one dashboard, not three separate silos.
- **Admin experience** is an operations console for a small team running both a store and an engineering shop from the same screens — built for daily operational use (queues, actionable lists), not a vanity analytics dashboard (Doc 01, Section 20).

These experiences connect through one authenticated account, one notification stream (email, per NOTIF-001), and one file store — a customer who buys a component today and requests a custom PCB next month never re-registers, re-verifies, or re-explains who they are.

---

## 3. Information Architecture

```
PUBLIC
├── Home
├── Products
│   ├── Category
│   └── Product Details
├── Search Results
├── Services
│   ├── Manufacturing (Landing + Information)
│   ├── Design / PCB Services (Landing + Information)
│   ├── Consultation (Landing + Information)
│   └── Software / Firmware Services (Landing + Information)
├── About
├── Contact
├── FAQ
├── Terms of Service
├── Privacy Policy
├── Shipping & Returns Policy
└── 404 / Error

CUSTOMER (authenticated)
├── Dashboard
├── Profile
├── Addresses
├── Orders
│   └── Order Details
├── Cart
├── Checkout
├── Manufacturing Requests
│   └── Request Details (incl. Quote, Files, Status)
├── Design Requests
│   └── Request Details
├── Consultation Requests
│   └── Request Details
├── Software Requests
│   └── Request Details
├── Quotes
│   └── Quote Details (with Version History)
├── Projects
│   └── Project Details (grouped requests)
├── Project Files (cross-request file library, filtered by request)
├── Payments & Invoices
├── Reviews
├── Notifications (send-history view)
└── Settings

ADMIN (role-scoped)
├── Dashboard
├── Customers
├── Catalog (Products, Categories)
├── Inventory
├── Orders
├── Payments & Refunds
├── Shipments
├── Manufacturing
├── Design Requests
├── Consultation Requests
├── Software Requests
├── Quotes
├── Project Files
├── Reviews (Moderation)
├── Notifications (Send History)
├── Analytics
├── Audit Logs
└── Settings (Role/Account Management)
```

No screen exists here that isn't traceable to a Document 01 module (Section 7) or capability. "Services" groups the four engineering-service modules under one public-facing umbrella since Document 01 treats them as parallel offerings (Section 6, ecosystem diagram) rather than four unrelated products.

---

## 4. Navigation Architecture

**Global header (all public + customer screens):** logo/home, primary nav (Products, Services, About/Contact collapsed under a "Company" menu on smaller viewports), search bar, cart icon (customer/guest), account menu (Login/Register for guests; avatar/name dropdown for authenticated customers linking to Dashboard, Orders, Requests, Settings, Logout).

**Global footer:** sitemap-style links (Products, Services, Company, Policies), contact information, no functional actions beyond navigation.

**Breadcrumbs:** shown on all non-root screens more than one level deep (e.g., Home → Products → Sensors → Product Detail; Dashboard → Manufacturing Requests → Request #1234). Not shown on the Dashboard itself or single-level public pages.

**Contextual navigation:** within a request/quote/order detail screen, a persistent sub-navigation (tabs or a side rail on desktop, a horizontal scroll on mobile) exposes Overview, Files, Quote, Status History, without leaving the detail screen.

**Account navigation:** a persistent left sidebar (desktop) / bottom-accessible drawer (mobile) listing all Customer IA items (Section 3), always visible while inside the authenticated account area, distinct from the public header nav.

**Admin navigation:** a persistent left sidebar reflecting the Admin IA (Section 3), filtered per the logged-in admin's role (Document 02, Section 21) — an `ORDER_MANAGER` never sees a "Quotes" nav item, for instance, since it isn't in their permission set; this is a UX convenience only, not the enforcement mechanism (Document 02 restates the same caution).

**Navigation behavior summary:**
- Global nav = header/footer, present everywhere in that context (public vs. customer vs. admin).
- Contextual nav = detail-screen sub-tabs, present only within a specific entity's detail view.
- Role-specific nav = the admin sidebar, filtered by permission.
- Workflow-specific nav = the stepper used inside Checkout and inside multi-step request forms (Section 24), which replaces normal navigation temporarily to keep the user focused on completing that flow.

---

## 5. User Access States

| State | UI Behavior |
|---|---|
| **Guest** | Full access to Public IA (browse, search, view product/service info). Cart is available but tied to a local/session cart; any attempt to checkout or submit a service request redirects to Login/Register with a clear "sign in to continue" message and the intended action preserved (return-to-flow after auth). |
| **Authenticated Customer (verified)** | Full access to Public + Customer IA, scoped to their own data (Document 02, ACCT-001 enforcement reflected as: no UI ever shows another customer's data because no endpoint returns it). |
| **Authenticated Customer (unverified email)** | Can browse and use the account shell, but Checkout and every service-request submission action are blocked with an inline banner: "Please verify your email to continue" plus a resend-verification action (AUTH-001). |
| **Admin** | No access to Customer IA framing (a distinct admin shell/layout, not a "customer account with extra tabs") — accesses only the Admin IA, scoped to their role's permitted sections (Document 02, Section 21). |
| **Unauthenticated user attempting a protected action** | Action is intercepted client-side for UX smoothness, but the actual protection is server-side (401); UI shows a login prompt, not a raw error. |
| **Unauthorized admin (insufficient role) attempting an action** | The action/section is not shown at all where feasible (sidebar filtering); if reached directly (e.g., a stale bookmark), the screen shows a clear "You don't have permission to view this" state (403), not a blank page or a crash. |
| **Expired session** | Any authenticated call failing with 401 due to an unrecoverable/expired session (refresh also failed) triggers a silent redirect to Login with a "Your session expired, please sign in again" message; any in-progress form data is preserved in local state where feasible so the user doesn't lose a half-filled manufacturing request. |
| **Disabled/deactivated account** | Login attempt for a deactivated account shows a clear, non-technical message ("This account is no longer active — contact support") rather than a generic invalid-credentials error. |

---

## 6. Responsive Design Strategy

VenopAI is designed **mobile-first**, since a large share of students/hobbyists will use it on a phone (Section 7 principle #13).

- **Navigation:** desktop shows a full horizontal header nav; mobile collapses to a hamburger drawer containing the same items plus account/cart shortcuts pinned to a persistent bottom bar (Home, Search, Cart, Account) for one-thumb reachability.
- **Cards (products, requests, quotes, orders):** desktop shows multi-column grids (3–4 up for products, 1–2 up for request/quote cards); mobile stacks to a single column with the same information density, not a truncated version.
- **Tables (order history, admin lists):** desktop renders as true tables with sortable columns; mobile/tablet collapses each row into a stacked "card" representation showing the same fields in a label:value layout, avoiding horizontal scroll wherever possible; wide admin tables (e.g., Orders with many columns) fall back to horizontal scroll with a frozen first column (identifier) as a last resort, only in the admin console where the audience is expected to primarily use desktop.
- **Forms (checkout, manufacturing request, etc.):** single-column on all breakpoints for readability; grouped sections (Section 24) render as accordions on mobile (one section expanded at a time) and as a single scrollable page with sticky section headers on desktop.
- **Checkout:** on mobile, the step content and the running order summary are two separate full-width screens (summary accessible via a "View order summary" expandable sheet) rather than a two-column side-by-side layout, which would force excessive zooming/scrolling on small viewports; desktop uses a two-column layout (form left, sticky summary right).
- **Product pages:** mobile shows the image gallery as a swipeable carousel above the fold, with price/stock/add-to-cart pinned as a sticky bottom bar while the user scrolls specifications; desktop uses a classic two-column gallery-left, details-right layout.
- **Manufacturing/service forms:** identical field set across breakpoints; only layout density changes (Section 24's grouped sections become full-screen steps on mobile via the accordion pattern above).
- **Admin tables:** as above — card-collapse on tablet, frozen-column scroll on the narrowest supported admin viewport (though admin is not optimized below tablet width, since Document 01 assumes staff use, not phone-first admin use).
- **Modal behavior:** on desktop, modals are centered overlays with a max-width; on mobile, the same content renders as a full-screen sheet sliding up from the bottom (a "bottom sheet") rather than a small centered box, to maximize usable space and match common mobile interaction patterns.
- **File upload:** desktop supports drag-and-drop plus a click-to-browse fallback; mobile shows a click-to-browse (native file/camera picker) affordance only, since drag-and-drop has no mobile equivalent.
- **Status displays (timelines/steppers):** desktop renders a horizontal stepper (Section 9, Stepper component); mobile renders the same stepper vertically, since a horizontal stepper with 8–10 states does not fit a narrow viewport without becoming illegibly compressed.

---

## 7. Design System Foundation

VenopAI's design system is intentionally small and coherent — enough to build every screen in this document, not a speculative general-purpose library.

- **Color philosophy:** a neutral, technical base (grays/near-blacks on white, or a dark technical navy) with a single confident accent color used sparingly for primary actions and active states — evoking engineering/technical tools rather than a bright, promotional retail palette. Status colors (success/warning/error/info) are distinct from the accent color so a "quote approved" green is never confusable with a generic call-to-action.
- **Typography hierarchy:** one primary typeface for UI text (a clean, highly legible sans-serif) and, optionally, a monospace typeface used specifically for technical values (part numbers, tracking numbers, quote IDs, file names) to visually signal "this is a precise/technical value, not prose." A clear 4–5 step type scale (e.g., display, heading, subheading, body, caption) covers every screen in this document without ad hoc sizes.
- **Spacing:** a consistent spacing scale (e.g., 4px base unit, multiples up to 64px) applied uniformly so density feels intentional rather than accidental between, say, a product card and a quote card.
- **Radius:** one small, consistent corner-radius value for cards/inputs/buttons (a subtle rounding, not a heavily rounded "friendly consumer app" look) reinforcing the technical-platform identity (Section 7 principle: professional, not a cheap marketplace).
- **Elevation:** a shallow, restrained shadow scale (2–3 levels: resting, raised/hover, overlay) — avoids heavy drop shadows that read as decorative rather than functional.
- **Borders:** thin, low-contrast borders used to separate content (tables, cards) as an alternative to elevation where a flatter feel is more appropriate (e.g., dense admin tables).
- **Icons:** a single consistent icon set (outline style, not mixed with filled icons) used for status, navigation, and file-type indicators.
- **Buttons:** primary (accent-filled, one per screen/section for the main action), secondary (outlined/neutral), tertiary/text (low-emphasis actions like "Cancel"), and destructive (reserved for irreversible actions like "Delete file," "Cancel request").
- **Inputs:** consistent text field, select, textarea, checkbox, radio, and file-input styling with clear focus, error, and disabled states, and inline validation messaging directly beneath the field.
- **Cards:** the base container for products, requests, quotes, orders — consistent padding/radius/elevation regardless of content type, so the "grammar" of a card is learned once.
- **Badges:** small, colored, label-only elements used exclusively for status (Section 9, StatusBadge) — never used for decorative tagging.
- **Alerts:** inline, non-blocking banners for page-level or section-level messages (e.g., "Please verify your email").
- **Dialogs:** centered (desktop) / bottom-sheet (mobile) overlays for confirmations and short focused tasks (Section 9, Modal/ConfirmationDialog).
- **Tabs:** used for switching between related views within one screen (e.g., a request's Overview/Files/Quote/History tabs).
- **Tables:** used for admin lists and any dense tabular customer data (order history); paired with the responsive collapse strategy in Section 6.
- **Pagination:** consistent page-based (not infinite-scroll) pagination for product listings and admin tables, since infinite scroll complicates "find and return to item #47" use cases common in admin work.
- **Tooltips:** short, supplementary clarifications only (e.g., explaining what "reserved stock" means to an admin) — never used to hide primary information a user needs to complete a task.
- **Progress indicators:** a spinner for short (<1s expected) waits, a skeleton loading pattern for content-shaped waits (product grids, tables), and the Stepper/Timeline components (Section 9) for multi-stage business processes — these are conceptually distinct and not interchangeable.

---

## 8. Design Tokens

Semantic tokens only; no exact hex/pixel values are locked here (none are defined in Document 01/02), leaving final values to the visual design phase within this structure.

**Color tokens:** `--color-primary`, `--color-primary-hover`, `--color-background`, `--color-surface`, `--color-surface-alt`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-disabled`, `--color-success`, `--color-warning`, `--color-error`, `--color-info`.

**Typography tokens:** `--font-family-base`, `--font-family-mono`, `--font-size-display`, `--font-size-heading`, `--font-size-subheading`, `--font-size-body`, `--font-size-caption`, `--font-weight-regular`, `--font-weight-medium`, `--font-weight-bold`, `--line-height-base`.

**Spacing tokens:** `--space-1` through `--space-8` (scaling from the base unit defined in Section 7).

**Radius tokens:** `--radius-sm`, `--radius-md` (buttons/inputs/cards use one of these two consistently).

**Shadow/elevation tokens:** `--elevation-0` (flat), `--elevation-1` (resting card), `--elevation-2` (raised/overlay).

**Z-index layers:** `--z-index-dropdown`, `--z-index-sticky-nav`, `--z-index-modal`, `--z-index-toast` (toasts always above modals, since a toast may need to confirm an action taken inside a modal).

**Motion tokens:** `--motion-duration-fast` (micro-interactions like button hover), `--motion-duration-base` (modal/drawer open-close), `--motion-easing-standard` — kept minimal per Section 7 principle #16 (avoid unnecessary animation); no separate token set for elaborate transition choreography.

---

## 9. Global Component System

| Component | Purpose | Used In | Key States | Interaction Notes |
|---|---|---|---|---|
| Header | Global navigation, search, cart, account entry | All public/customer screens | Guest / Authenticated | Sticky on scroll (desktop); collapses to hamburger on mobile |
| Footer | Sitemap, policies, contact | All public screens | Static | Not shown inside authenticated account/admin shells |
| SearchBar | Product search entry point | Header, Product Listing, Search Results | Empty / Typing / Loading / Results | Debounced input; Enter or icon-click submits |
| ProductCard | Summarize a product for browsing | Product Listing, Home, related-products | In stock / Low stock / Out of stock | Entire card is a click target to Product Details |
| CategoryCard | Summarize a category for browsing | Home, Category navigation | Static | — |
| PriceBlock | Display price (and, where relevant, tax note) | Product Details, Cart, Checkout, Quotes | Static / Discounted (only if catalog defines a sale price) | — |
| QuantitySelector | Adjust a line-item quantity | Cart, Product Details | Default / At max stock / Invalid (below 1) | Stepper buttons + direct numeric input |
| StatusBadge | Communicate the current status of an order/request/quote/payment/shipment | Everywhere a stateful entity appears | One color/label per defined state (Document 01, Section 22) | Never interactive on its own |
| Alert | Page/section-level message | Any screen needing to communicate a condition (unverified email, expired reservation) | Info / Success / Warning / Error | Dismissible where the underlying condition allows it |
| Toast | Transient confirmation of an action | Any screen after a state-changing action | Success / Error | Auto-dismiss after a short delay; does not block interaction |
| Modal | Focused overlay task | Confirmations, quick forms (e.g., add address) | Open / Loading (submitting) / Error | Becomes a bottom sheet on mobile (Section 6) |
| Drawer | Slide-in panel for secondary content | Mobile navigation, filter panel on mobile | Open/Closed | — |
| FileUploader | Accept file uploads for a request | Manufacturing/Design/Software/Consultation request forms | Idle / Dragging / Uploading / Scanning / Clean / Flagged / Failed | Reflects the file lifecycle in Document 02, Section 16 |
| FileList | Show files associated with a request | Request Details, Project Files | Loading / Populated / Empty | Distinguishes customer-uploaded vs. delivered files visually |
| Timeline | Chronological history of a request/order | Order Tracking, Request Details, Clarification thread | Loading / Populated / Empty | Distinct from Stepper — Timeline is a log, Stepper is current position |
| Stepper | Current position within a defined lifecycle | Order Tracking, Manufacturing/Service status, Checkout, multi-step request forms | Each step: upcoming / current / complete / blocked | Horizontal (desktop) / vertical (mobile), per Section 6 |
| QuoteCard | Summarize a quote for a list view | Quotes list, Request Details | Draft / Sent / Viewed / Approved / Rejected / Expired / Superseded | Superseded quotes are visually muted (Section 28) |
| OrderCard | Summarize an order for a list view | Orders list, Dashboard | Per Order status (Document 01, Section 22) | — |
| ServiceCard | Summarize a service request for a list view | Manufacturing/Design/Consultation/Software lists, Dashboard | Per respective request status | — |
| EmptyState | Communicate "nothing here yet" with a next action | Any list screen with zero results | Static | Always pairs a message with a relevant CTA (e.g., "Browse products") |
| LoadingState | Communicate in-progress data fetch | Any data-driven screen | Static | Skeleton-shaped to the eventual content (Section 7) |
| ErrorState | Communicate a failed fetch/action | Any data-driven screen | Retryable / Non-retryable | Always offers a retry action where the failure is plausibly transient |
| ConfirmationDialog | Confirm an irreversible/significant action | Cancel request, delete file, delete address | Idle / Confirming / Processing | Requires explicit confirmation, never a single accidental click |
| DataTable | Present tabular data | Admin lists, Order History | Loading / Populated / Empty / Error | Paired with Pagination and FilterBar |
| Pagination | Navigate multi-page lists | Product Listing, all Admin lists | Static | Page-based, not infinite scroll (Section 7) |
| FilterBar | Apply filters/sorting to a list | Product Listing, Admin lists | Default / Active filters applied | Active filters are visibly chip-displayed and individually removable |

---

## 10. UI State System

Every data-driven screen in this document is built from the same reusable state vocabulary:

1. **Loading** — initial fetch in progress; shown via skeleton (LoadingState) matching the eventual layout.
2. **Loaded** — data present, normal interactive view.
3. **Empty** — a valid, successful fetch that returned zero items (EmptyState with a relevant next action).
4. **Error** — the fetch or action failed (ErrorState); distinguishes retryable network/server errors from non-retryable ones (e.g., "this quote no longer exists").
5. **Unauthorized** — the user's session is invalid; redirects to login (Section 5) rather than rendering a broken screen.
6. **Forbidden** — the user is authenticated but lacks permission (Section 5); shows a clear access-denied message, not a blank screen.
7. **Offline/network failure** — detected via failed requests; shown as a persistent, dismissible banner ("You appear to be offline") rather than silently failing actions, particularly relevant for file upload and checkout/payment screens where a silent failure would be costly.
8. **Processing** — a state-changing action is in flight (e.g., "Submitting request…", "Confirming payment…"); the triggering control is disabled to prevent duplicate submission, addressing Document 01's duplicate-request exception behavior (Section 24 of Doc 01) at the UI layer.
9. **Success** — confirmed completion of an action (Toast, or a dedicated confirmation screen for significant actions like Order Confirmation).
10. **Partial/incomplete state** — used specifically for multi-step forms (checkout, request forms) to show which sections are complete vs. still required, and for quotes/requests where some but not all expected information is present (e.g., "Awaiting your response to 1 of 2 clarification questions").

These ten states are referenced by name throughout Sections 11–47 rather than re-described per screen.

---

## 11. Public Website Screens

| Screen | Purpose | Supported By |
|---|---|---|
| Home | Orient a new visitor, route into commerce or services | Doc 01 §2, §6 |
| Product Listing | Browse/filter the catalog | Doc 01 §7.2–7.4 |
| Category | Browse a specific category | Doc 01 §7.3 |
| Product Details | Evaluate and purchase a single product | Doc 01 §7.2 |
| Search Results | Find products by keyword | Doc 01 §7.4, §27 |
| Manufacturing Landing/Information | Explain and enter the manufacturing service | Doc 01 §7.12, §10 |
| Design/PCB Landing/Information | Explain and enter the design service | Doc 01 §7.13 |
| Consultation Landing/Information | Explain and enter consultation | Doc 01 §7.14 |
| Software/Firmware Landing/Information | Explain and enter the software service | Doc 01 §7.15 |
| About | Company/trust context | Controlled UX assumption (see below) |
| Contact | Support/contact info | Controlled UX assumption (see below) |
| FAQ | Reduce repetitive support questions | Controlled UX assumption (see below) |
| Terms of Service | Legal terms | Controlled UX assumption (see below) |
| Privacy Policy | Legal/privacy disclosure | Controlled UX assumption (see below) |
| Shipping & Returns Policy | Set delivery/return expectations | Doc 01 §14 |
| 404 / Error | Handle broken/invalid links | Standard web requirement |

**Controlled UX assumption:** Document 01 does not explicitly define About, Contact, FAQ, Terms, or Privacy screens as product modules, but a real commerce-and-payments platform operating in India cannot reasonably launch without basic company/contact information and legal policy pages — this is treated as baseline web presence rather than a product feature, and each is a single static/CMS-light page with no dynamic business logic, so it does not expand V1 scope in the sense Document 01 guards against.

No "Wishlist," "Compare Products," "Blog," or similar generic-ecommerce screens are included, since none are supported by Document 01 and Section 7's critical rule explicitly warns against adding them.

---

## 12. Home Page Specification

| Section | Purpose | Content | User Action | Destination | Mobile Behavior |
|---|---|---|---|---|---|
| Header | Global nav/search/cart/account | Per Section 4 | Navigate, search | Various | Collapses to hamburger + bottom bar |
| Hero | State VenopAI's core value proposition | Headline + supporting line + two primary CTAs (e.g., "Browse Products" and "Start a Project") | Click a CTA | Product Listing or Services overview | Stacked, CTAs full-width |
| Product Discovery | Let the visitor jump straight into commerce | A short set of top-level category tiles | Click a category | Category screen | Horizontal scroll of tiles |
| Engineering Services Overview | Communicate the four service offerings clearly and side by side | Four cards (Manufacturing, Design/PCB, Consultation, Software) each with a one-line description | Click a card | Respective service landing page | Stacked single column |
| Project Realization Pathway | Visually explain the "idea → realization" journey (Doc 01 §2, §6) | A simple step visualization: Idea → Design → Manufacture → Deliver (or similar, mirroring the ecosystem diagram) | None required (illustrative) | — | Vertical version of the same steps |
| Trust Signals | Build credibility for a platform handling payments and engineering IP | Statements grounded in real platform facts (e.g., secure payments via Razorpay, private project files) — no fabricated testimonials/numbers | None | — | Stacked |
| Featured Products (if catalog supports it) | Surface a curated/best-selling subset | A product grid using ProductCard | Click a product | Product Details | Horizontal scroll |
| Footer | Sitemap/policies/contact | Per Section 4 | Navigate | Various pages | Stacked accordion-style link groups |

No marketing copy is authored here — only structure, per the instruction.

---

## 13. Product Listing Screen

- **Page header:** category/listing title, item count.
- **Search:** the global SearchBar, pre-scoped to the current category if applicable.
- **Category navigation:** a filter-panel category tree (desktop: left sidebar; mobile: a "Filters" button opening a Drawer).
- **Filters:** price range, availability (in stock/out of stock) — matching Document 01 §27 exactly; no filters beyond what that section specifies (e.g., no brand/rating filters unless later added to Doc 01).
- **Sorting:** relevance (default), price low-high, price high-low, newest — per Doc 01 §27.
- **Product cards:** ProductCard grid, responsive per Section 6.
- **Pricing/availability:** shown directly on the card (PriceBlock + a stock-status StatusBadge); out-of-stock products remain visible but their "Add to Cart" affordance is replaced with a disabled "Out of Stock" label on the card itself (CAT-003).
- **Pagination:** page-based (Section 7), not infinite scroll.
- **Empty state:** "No products match your filters" with a "Clear filters" action (distinct from the no-search-results case in Section 15).
- **Loading state:** skeleton grid of ProductCard placeholders.
- **Error state:** ErrorState with retry.
- **Mobile behavior:** filters collapse into a Drawer triggered by a persistent "Filters" button above the grid; sort control becomes a single dropdown rather than a button group.

---

## 14. Product Details Screen

- **Image/media gallery:** swipeable carousel (mobile) / thumbnail-strip gallery (desktop).
- **Product title, price (PriceBlock), stock status (StatusBadge):** in stock / low stock / out of stock / unavailable (discontinued — CAT-001 means this state should rarely be reachable via normal browsing, but is handled defensively for stale links).
- **Specifications:** a structured key-value table, not a paragraph, since these are engineering/electronics specs a technically literate buyer needs to scan quickly.
- **Description:** prose, below specifications.
- **Quantity (QuantitySelector) and Add to Cart:** disabled with a clear label when out of stock or unavailable; capped at currently displayed available stock (a soft check per CART-002 — final validation happens at checkout per Document 02 §12).
- **Delivery information:** a calculated estimate placeholder (e.g., "Enter your PIN code to see delivery estimate") consistent with SHIP-002 — never a fixed promised date on this screen, since serviceability/ETA is a live Shiprocket lookup tied to an address, not a catalog attribute.
- **Related products (where justified):** shown only if the catalog module supports a relation (e.g., same category) — this is a light "customers browsing this category" list, not a recommendation engine (explicitly out of scope, Doc 01 §30).
- **Service/project relevance (where appropriate):** for components commonly paired with a service (e.g., a raw PCB blank near the Design service), a single, clearly-labeled contextual link to the relevant service landing page — not a cross-sell mechanism, just wayfinding consistent with the "connect commerce and services" identity (Section 2).
- **States:** Loading (skeleton), Error (ErrorState + retry), and the four stock states above rendered via StatusBadge + conditional Add-to-Cart affordance.

---

## 15. Search Experience

- **Search input:** in the global Header, expandable to a full-width input on mobile.
- **Autocomplete:** a lightweight suggestion list (matching product names) shown after a short debounce once the user has typed a minimum number of characters — justified as a direct extension of Doc 01's keyword search requirement (SRCH-001), not a separate AI feature.
- **Search results:** reuses the Product Listing layout (Section 13) with the query term shown in the page header and search-relevance as the default sort.
- **Filters/sorting:** identical to Product Listing.
- **No results / typo handling:** per SRCH-002, shows related category suggestions rather than a dead end — no "did you mean" spell-correction is implemented in V1 (not required by Doc 01, and would imply a more sophisticated search capability than the PostgreSQL-based approach in Doc 02 §5/§27).
- **Loading/Error:** standard states per Section 10.

No AI-powered semantic search or conversational search assistant is introduced for V1, consistent with Document 01's explicit exclusion of a dedicated recommendation/AI engine (Section 30).

---

## 16. Cart Experience

- **Cart item:** product image/name/unit price, QuantitySelector, line subtotal, remove action.
- **Stock warning:** if a cart item's available stock has dropped below the cart quantity since it was added (a soft, non-blocking check — CART-002), an inline warning appears on that line ("Only 2 left — quantity will be adjusted at checkout") without blocking cart viewing.
- **Subtotal:** sum of line items, shown prominently; tax/shipping are explicitly deferred to Checkout, not estimated here, since neither is calculable without an address (avoids showing a misleading number).
- **Empty cart:** EmptyState with a "Browse Products" CTA.
- **Checkout CTA:** a persistent, prominent "Proceed to Checkout" button; disabled with an inline message if the cart is empty or if every item is currently unavailable.
- **Communicating no-reservation:** a small, non-alarming inline note near the checkout CTA ("Items aren't reserved until checkout") sets expectations honestly without being an anxiety-inducing warning, satisfying CART-001's transparency intent without overstating urgency.

---

## 17. Checkout Experience

```
Cart → Address → Shipping → Order Summary (with Tax) → Payment → Confirmation
```

- **Address selection:** a list of the customer's saved addresses (radio-selectable cards) plus an "Add new address" action opening a Modal/full-screen form (mobile); the selected address is validated for serviceability (a live check) before the flow proceeds (CHK-002, ADDR-002).
- **Address creation:** standard address form fields (name, phone, line 1/2, city, state, PIN, and a default-address toggle); PIN entry immediately triggers the serviceability check so the customer learns about an unserviceable area before finishing the whole form.
- **Shipping calculation / delivery estimate:** shown once an address is selected — a calculated rate and ETA (SHIP-002), never hardcoded.
- **Tax:** a clearly labeled tax line (CGST+SGST or IGST per TAX-002), computed once the address determines intra-/inter-state status.
- **Price summary:** persistent throughout the flow (sticky sidebar on desktop, expandable sheet on mobile — Section 6) showing Subtotal, Shipping, Tax, and Total as four distinct, clearly labeled lines — never collapsed into a single number until the final confirmation screen.
- **Payment CTA:** appears only once address + shipping are confirmed; clicking it enters Payment UX (Section 18).
- **Error states:**
  - **Expired reservation:** if the customer stalls past the ~15-minute reservation window (INV-003/004), the checkout screen detects this (via a countdown indicator and/or a failed pre-payment re-check) and shows a clear, non-blaming message ("Your reserved items have timed out — please review your cart again") routing back to Cart rather than letting the customer attempt to pay against a lapsed reservation.
  - **Out-of-stock during checkout:** if a hard stock check fails at reservation-creation time (Document 02 §12), the specific affected line item is flagged inline with an option to remove it and continue with the rest of the cart, rather than blocking the entire checkout silently.
- **A visible countdown/reservation indicator:** once past the Address step, a small persistent indicator ("Items held for 14:32") gives the customer honest visibility into the reservation window (INV-003), reducing the chance of a frustrating expired-checkout surprise.

---

## 18. Payment UX

Razorpay is the sole gateway (PAY-001); the UX must never claim more certainty than the backend actually has (PAY-002).

- **Payment initiation:** clicking "Pay Now" shows a brief Processing state (Section 10) while the backend creates the Razorpay order, then opens Razorpay's own hosted checkout as a modal overlay (the standard Razorpay Checkout widget), keeping the customer on VenopAI's page in the background.
- **Payment processing:** while Razorpay's widget is active, VenopAI's own screen behind it shows a calm "Waiting for payment confirmation…" state — no premature success indication.
- **Success:** upon the widget's own success callback, VenopAI shows a **"Confirming your payment…"** interim screen (Processing state) rather than immediately declaring success — because per PAY-002, the frontend callback alone is not authoritative. This interim screen polls/awaits the backend's verified confirmation (a short wait in the overwhelming majority of cases) before transitioning to Order Confirmation (Section 19).
- **Failure:** a clear "Payment failed" state with the (safely normalized, per Document 02 §25) reason where available, and a "Try again" action that re-initiates payment against the same still-active reservation/quote if the window hasn't lapsed.
- **Cancelled payment:** if the customer closes the Razorpay widget without completing payment, VenopAI returns to the pre-payment Checkout/Quote screen unchanged — no false failure message, since nothing was actually attempted.
- **Retry:** always available while the underlying reservation (commerce) or quote-approval (service) is still valid; once expired, retry is replaced with a message directing the customer back to Cart or to request a fresh quote status.
- **Uncertain payment state:** if the backend has not yet received a verified confirmation after a reasonable wait (e.g., the "Confirming your payment…" screen exceeds a short timeout), the UI shifts to an honest **"Payment Requires Verification"** state: "We're still confirming your payment with Razorpay. This can take a few minutes — you'll receive an email as soon as it's confirmed, and you can also check your Order/Request status anytime." This explicitly avoids ever showing "Order Paid" based on client state alone, and gives the customer a safe, truthful place to be left (Document 02, Section 14's race-condition handling is what eventually resolves this state from the backend side).
- **Distinct states surfaced to the customer:** Payment Processing, Payment Confirmed, Payment Failed, Payment Requires Verification — exactly the four named in the source instructions, each with its own visual treatment (StatusBadge colors) so they are never visually interchangeable.

---

## 19. Order Confirmation

Shown once payment is verified (never before, per Section 18).

- **Order number:** prominent, copyable.
- **Payment status:** shown as its own StatusBadge (e.g., "Payment Confirmed") — distinct from order status (Section 20 restates this separation).
- **Order status:** shown as its own StatusBadge (e.g., "Processing").
- **Items:** a summary list (name, quantity, price) matching the OrderItem snapshot (Document 02 §13) — this list will not change even if the catalog price changes later.
- **Amount:** the final total breakdown (Subtotal/Shipping/Tax/Total), matching the snapshot taken at order creation.
- **Shipping address:** the address used for this order.
- **Estimated delivery:** the calculated ETA captured at order time.
- **Next steps:** a short, plain-language note on what happens next ("We'll email you once your order ships").
- **Tracking availability:** a "Tracking will appear here once shipped" placeholder that becomes an active tracking link once a Shipment exists (Section 20).
- **Invoice availability:** a "Download Invoice" action, available as soon as the order is created (Document 01 §12, invoice generated on order creation).

---

## 20. Order Tracking

- **Order timeline (Timeline component):** a chronological log of everything that has happened to this order (created, paid, processing, shipped, delivered), each entry timestamped.
- **Current-position indicator (Stepper):** Processing → Ready to Ship → Shipped → Delivered, showing where the order currently sits.
- **Three explicitly separate status displays, never collapsed into one:**
  - **Order Status** (fulfillment progress) — its own StatusBadge.
  - **Payment Status** (financial state — Successful/Refunded, etc.) — its own StatusBadge, shown adjacent but visually distinct.
  - **Shipment Status** (carrier-reported state, once a shipment exists) — its own StatusBadge, including a tracking number/link once available.
- This three-way separation directly implements ORD-002 and the shipment/payment/order distinction throughout Document 01, and prevents the common ecommerce UX mistake of a single ambiguous "status" field that conflates "we got your money" with "the box left the warehouse" with "the courier delivered it."
- **Shipping exception handling:** if a Shipment enters an exception state (Document 01 §24), the tracking screen surfaces this clearly with guidance (e.g., "There's an issue with your delivery address — our team will contact you") rather than silently freezing the stepper with no explanation.

---

## 21. Customer Account

The account area uses the persistent sidebar navigation described in Section 4, wrapping every screen below.

| Screen | Purpose | Content | Actions | Permissions | Key States |
|---|---|---|---|---|---|
| Dashboard | Orient the customer, surface what needs attention | See Section 22 | Navigate to any item | Own data only | Loading/Loaded/Empty |
| Profile | Manage identity | Name, email (read-only or verified-change), phone | Edit, change password | Own data only | Loaded/Processing/Error |
| Addresses | Manage saved addresses | Address cards, default indicator | Add/Edit/Delete/Set default | Own data only | Loaded/Empty/Processing |
| Orders | List all commerce orders | OrderCard list | Filter by status, open detail | Own data only | Loading/Loaded/Empty/Error |
| Order Details | Full detail of one order | Per Section 19/20 | Cancel (if eligible), request review, download invoice | Own order only | Per Section 20 |
| Payments & Invoices | List all payment attempts and invoices | Table of payments (status, amount, date, linked order/quote), invoice download links | Download invoice | Own data only | Loading/Loaded/Empty |
| Manufacturing Requests | List all manufacturing requests | ServiceCard list | Filter by status, open detail, start new request | Own data only | Loading/Loaded/Empty/Error |
| Design Requests | Same pattern as Manufacturing | ServiceCard list | Same as above | Own data only | Same |
| Consultation Requests | Same pattern | ServiceCard list | Same as above | Own data only | Same |
| Software Requests | Same pattern | ServiceCard list | Same as above | Own data only | Same |
| Request Details (shared pattern) | Full detail of one service request | See Section 23 | Respond to clarification, view quote, approve/reject, pay, cancel (if eligible) | Own request only | Per Section 25 |
| Quotes | List all quotes across requests | QuoteCard list | Open detail | Own data only | Loading/Loaded/Empty |
| Quote Details | Full detail of one quote, with version history | See Section 27/28 | Approve/reject, pay | Own quote only | Per Section 27 |
| Projects | List conceptual project groupings | Simple list of project names with linked request counts | Create/rename a project grouping, open detail | Own data only | Loading/Loaded/Empty |
| Project Details | Show all requests grouped under one project | List of linked requests (any type) | Link/unlink a request | Own data only | Loading/Loaded/Empty |
| Project Files | Cross-request file library | FileList filtered by request/project | Upload (within a request context), download | Own files only | Per FileUploader states |
| Reviews | List of the customer's own reviews | Review cards | Edit/delete (within permitted window) | Own reviews only | Loading/Loaded/Empty |
| Notifications | Send-history log (not an inbox) | List of sent emails (subject/date/status) | None beyond viewing | Own data only | Loading/Loaded/Empty |
| Settings | Account preferences | Password change, notification email | Save changes | Own data only | Processing/Success/Error |

**Controlled UX assumption:** a "Projects" screen is included per Document 02's resolution of Document 01's open question (Section 34) that `Project` is persisted as a lightweight grouping entity in V1 — the UI here stays correspondingly lightweight (a name and a list of linked requests, no Gantt/kanban tooling), avoiding the "advanced project management" Document 01 explicitly defers (Section 31).

---

## 22. Customer Dashboard

The dashboard is an **action surface**, not a decorative analytics view (per the explicit instruction).

- **Primary cards (top of page, in priority order):**
  1. **Action-required items** — quotes awaiting approval, clarifications awaiting a response, payments in an uncertain/requires-verification state (Section 18). Each item is a direct link to the exact screen needed to resolve it.
  2. **Active orders** — commerce orders not yet Delivered/Completed, as compact OrderCards.
  3. **Active service requests** — manufacturing/design/consultation/software requests not yet Completed, as compact ServiceCards, each showing its current Stepper position.
- **Status indicators:** every card carries its relevant StatusBadge(s) so the dashboard is scannable without opening anything.
- **Action prompts:** a distinct, higher-contrast treatment for "Action required" items versus purely informational "in progress" items, so a customer's eye is drawn to what actually needs them.
- **Recent activity:** a compact Timeline-style feed (last 5–10 events across all the customer's orders/requests — payment confirmed, quote issued, shipment created, etc.) below the primary cards.
- **Project progress (where a Project grouping exists):** a small section listing the customer's active Projects with a rollup of linked-request statuses, linking into Project Details (Section 21).
- **Empty state:** for a brand-new customer with no orders/requests, the dashboard shows a clear, friendly EmptyState with two direct CTAs — "Browse Products" and "Start a Project" — mirroring the Home hero's dual entry points (Section 12).

---

## 23. Manufacturing UX

The manufacturing workflow is the platform's core differentiator (Document 01, Section 10) and receives the most detailed screen treatment.

| Screen | Purpose | Fields/Content | User Actions | Validation | Status | Navigation | Next/Previous | Cancellation | Error Behavior |
|---|---|---|---|---|---|---|---|---|---|
| Manufacturing Landing (public) | Explain the service, build confidence to start | What manufacturing covers, how the process works (Section→Section 10 pathway visualized), examples of suitable requests | "Start a Manufacturing Request" | — | — | From Home/Services nav | → Request Manufacturing | — | — |
| Request Manufacturing (Section 24) | Collect initial requirements | See Section 24 | Fill sections, upload files, submit | Per-field + section-level (Section 24) | Draft (client-side only, not yet a backend entity until submit) | Multi-step form nav | → submission creates the request, routes to Request Details | Discard draft (no backend record exists yet, so this is just clearing the form) | Inline field errors; a submission failure (network/server) preserves entered data and shows a retry |
| Request Details (shared shell for all statuses) | Single durable URL a customer returns to throughout the lifecycle | Overview tab (summary, current Stepper position), Files tab, Quote tab, History tab (Timeline) | Varies by current status (below) | — | Reflects Document 01 §22 Manufacturing Request states | Tabs within the screen (Section 4, contextual nav) | Status-dependent, see below | Cancel action available per MFG-004/005/006 rules, gated by current status | Per Section 10 (this document) generic error handling |
| Clarification (within Request Details) | Structured Q&A when the admin needs more information | See Section 26 | Respond to each open question, optionally attach files | Cannot submit an empty response to an open question | "Clarification Needed" | Overview tab surfaces a banner linking here | → Requirement Confirmed once resolved | — | — |
| Quote (within Request Details, Quote tab) | Present pricing/scope for approval | See Section 27 | Approve / Reject | Cannot approve an expired or superseded version | "Quote Ready" / "Awaiting Approval" | Quote tab | → Payment (on approval) or back to Clarification (on rejection, customer's choice) | Reject is itself a form of controlled "cancellation" of that quote version, not the whole request | — |
| Payment (within Request Details) | Collect payment against an Approved quote | Reuses Payment UX (Section 18), scoped to the quote amount | Pay | Blocked entirely unless Quote.status = Approved (QUOTE-001, enforced server-side, mirrored client-side by simply not rendering the Pay action otherwise) | "Payment Pending" → "Paid" | Quote tab / Overview tab | → In Execution | Not applicable once payment succeeds; MFG-004 cancellation only applies before this point | Uncertain-payment handling identical to Section 18 |
| Manufacturing Progress (within Request Details, Overview tab) | Show execution status | Stepper position + any admin-posted plain-language status notes (e.g., "Materials sourced") | View only | — | "In Execution" (with sub-labels as admins update them) | Overview tab | → Completion/Delivery | Cancellation after execution start requires admin review (MFG-006) — the UI shows a "Request Cancellation" action that submits a request to an admin rather than instantly cancelling | — |
| Delivery (within Request Details) | Show delivery status for a physical deliverable | Reuses Order Tracking's Shipment display pattern (Section 20) | View tracking | — | "Shipped" → "Delivered" | Overview tab | → Completion | — | Shipping exception handling identical to Section 20 |
| Completion | Confirm the engagement is done | Summary of the completed engagement, deliverable files (Files tab), a "Leave a Review" CTA | Confirm receipt, leave review | — | "Completed" | Overview tab | Terminal | — | — |

**Cancellation is always visible but only sometimes enabled** — the action itself is never hidden (so the customer always knows the option exists), but per MFG-004/005/006 it is presented differently depending on stage: a direct one-click cancel before payment, a "Request Cancellation" (with a note explaining a refund will be processed) after payment but pre-execution, and a "Request Cancellation Review" (setting clear expectations that this requires admin judgment and terms per the approved quote) once execution has started.

---

## 24. Manufacturing Request Form

Organized into progressive, collapsible sections rather than one long form (Section 6's accordion pattern on mobile; a single scrollable page with sticky section anchors on desktop):

1. **Project Overview** — a short free-text description of what the customer is trying to achieve (required).
2. **Product/Prototype Type** — a simple categorization (e.g., PCB assembly, enclosure, mechanical part, other) to route the request appropriately for review.
3. **Quantity** — numeric input (required); framed as "how many units do you need," directly informing manufacturing scoping.
4. **Technical Requirements** — free-text + optional structured fields for known specifications (only shown if the customer indicates they have them — progressive disclosure).
5. **Dimensions** — optional numeric fields (L×W×H or similar), shown only if relevant to the selected Product/Prototype Type.
6. **Materials** — optional free-text/select, shown only if relevant to the selected type.
7. **PCB/Hardware Details** — shown conditionally (progressive disclosure) only when the Product/Prototype Type implies electronics (e.g., PCB assembly), avoiding irrelevant fields for a purely mechanical request.
8. **Manufacturing Requirements** — any process-specific notes (finish, tolerance expectations) as free text — kept unstructured in V1 rather than a rigid schema, since Document 01 does not define a fixed technical taxonomy for this.
9. **Delivery Requirements** — target timeframe expectation (free text/date picker, understood by the customer as a request, not a guarantee — consistent with SHIP-002's "calculated, not guaranteed" principle extended here to manufacturing timelines).
10. **Additional Notes** — free text, catch-all.
11. **Files** — the FileUploader component; customer can attach schematics, reference images, CAD files, etc. (Document 01 §16 accepted types).

**Progressive disclosure rationale:** sections 5–7 only appear once section 2 (Product/Prototype Type) makes them relevant, so a customer requesting, say, a simple enclosure is never confronted with PCB-specific fields. This keeps the form from becoming the "giant confusing form" the instructions explicitly warn against, while still collecting everything Manufacturing Review (Document 01, Section 10) needs to begin technical review.

**Validation:** Project Overview, Product/Prototype Type, and Quantity are the only hard-required fields to submit; every other section can be left incomplete and filled in later via Clarification (Section 26) if the reviewing administrator needs it — this matches Document 01's own workflow, where Clarification is the designed mechanism for filling gaps, not a form validation failure.

---

## 25. Manufacturing Request Status

Directly implements Document 01, Section 22's state model — no additional states are invented.

| State | Customer-Facing Label | Explanation | Available Actions | Next Expected Action |
|---|---|---|---|---|
| Submitted | "Submitted" | Your request has been received and is queued for review | Cancel | Wait for review |
| Under Review | "Under Review" | An engineer is evaluating feasibility | Cancel | Wait |
| Clarification Needed | "We need more information" | The team has questions before proceeding | Respond to clarification, cancel | Answer the open question(s) |
| Requirement Confirmed | "Requirements Confirmed" | Your requirements are locked in and a quote is being prepared | Cancel | Wait for quote |
| Quoted / Awaiting Approval | "Quote Ready — Awaiting Your Approval" | A price and scope have been proposed | Review quote, approve, reject, cancel | Approve or reject the quote |
| Approved / Payment Pending | "Approved — Payment Pending" | You approved the quote; payment is needed to begin work | Pay, cancel (MFG-004 rules) | Complete payment |
| Paid / In Execution | "In Production" | Your project is being manufactured | Request cancellation (MFG-005/006) | Wait for completion updates |
| Completed (execution) / Delivery | "Shipped" / "Ready for Delivery" | Manufacturing is done; delivery is in progress (physical) or files are ready (digital) | Track shipment, download deliverables | Receive delivery |
| Completed (final) | "Completed" | Your project is fully delivered | Leave a review | — (terminal) |
| Rejected (quote) | "Quote Rejected" | You declined the proposed quote | Request revision (returns to Clarification), or leave the request closed | Decide whether to continue |
| Expired (quote) | "Quote Expired" | The quote's validity window passed without action | Request a new quote | Request a fresh quote if still interested |
| Cancelled | "Cancelled" | This request was cancelled | — (terminal) | — |

Every label is written to be understandable without engineering/project-management jargon, per Section 7's "student-friendly" principle, while never misrepresenting the underlying state from Document 01.

---

## 26. Clarification UX

Deliberately **not** a live chat — a structured, asynchronous, organized thread, per the explicit instruction and Document 01's CONSULT-001-style asynchronous design applied here to Manufacturing/Design/Software as well.

- **Clarification message:** each admin-raised question is a distinct, timestamped, numbered item (not a chat bubble stream) — e.g., "Question 1 of 2: What voltage does this need to operate at?"
- **Customer response:** a dedicated response field directly beneath each question, submitted independently — so a customer can answer Question 1 now and Question 2 later without losing progress.
- **Attached files:** each question or response can carry an attached file via the same FileUploader component used in the request form.
- **Timestamps:** shown on every question and response, in the customer's local time.
- **Status per question:** each individual question shows its own StatusBadge — "Awaiting your response" or "Resolved" — visible in a compact list so a customer with two open questions can see at a glance which one still needs attention (this is the "Partial/incomplete state," Section 10, item 10, applied here).
- **Overall clarification status:** the request only exits "Clarification Needed" (returns to Requirement Confirmed) once every open question has a response — shown as a simple progress indicator ("1 of 2 answered").
- **Why this feels organized, not like generic chat:** the numbered-question/threaded-response structure, per-question resolution status, and absence of any "typing indicator"/real-time presence UI (which would imply a synchronous expectation Document 01 does not support) keep this feeling like a structured intake form extension rather than a messaging app.

---

## 27. Quote UX

- **Quote list:** QuoteCard entries showing the associated request, current version number, status, and total price; superseded/expired/rejected quotes remain listed (muted styling) rather than disappearing, since Document 01 requires version history to remain visible (QUOTE-003/004 and Section 11's "version history is retained and visible").
- **Quote details:** the customer must clearly see, in order: **what is being quoted** (a scope summary tied back to the request), **itemized pricing**, **applicable tax**, **applicable shipping (if physical)**, **estimated execution/delivery timeframe**, **validity period** (with a visible countdown once within a threshold, e.g., "Expires in 3 days"), **terms and notes**, **version number**, and **current status** (StatusBadge).
- **What happens after approval:** a short, explicit line directly on the quote detail screen — "Approving this quote will allow you to proceed to payment. No charge happens until you complete payment separately." — removing any ambiguity that approval itself is not a charge (this directly operationalizes QUOTE-001's "approval unlocks payment" as a plain-language UI statement).
- **Approval/rejection:** two clearly distinct primary actions (Approve — accent/primary button; Reject — secondary/neutral button, not styled as destructive/red, since rejecting a quote is a normal, low-friction business decision, not a dangerous action); rejecting opens a short optional-reason field before confirming, useful context for the admin who will follow up.
- **Expiry:** an expired quote's detail screen replaces the Approve/Reject actions with a single "Request a New Quote" action, linking back into the Clarification/request flow.
- **Superseded quotes:** remain viewable in full (read-only, no actions) directly from the version history (Section 28), clearly labeled as historical.

---

## 28. Quote Version UX

This is treated as a first-class, highly visible UX pattern given its explicit criticality in Document 01 (QUOTE-003/004).

- **Version indicator:** every quote detail screen shows a persistent, unmissable version badge (e.g., "Version 2 — Current") directly beside the quote title — never buried in fine print.
- **Superseded marking:** a superseded version, if reached via the version history list, displays a full-width banner at the top: **"This is a previous version. It has been replaced by Version 2, which is the current quote."** with a direct link to the current version — making it structurally impossible to mistake an old version for the active one.
- **Version history list:** shown as a simple reverse-chronological list (V2 at top, V1 below) inside a "Version History" tab/section on the quote detail screen, each entry showing its version number, date, status (Approved/Superseded/Rejected/etc.), and total price — so a customer can see at a glance that, say, the price changed between V1 and V2.
- **Approved historical versions remain visible:** if a customer approved V1 and it was later superseded by V2 due to a requirement change (before payment) or a post-payment renegotiation (Document 01, Section 10's requirement-change rules), V1's approval record is never hidden or deleted — it remains in the Version History as a historical record with its own "Approved (Superseded)" status label, satisfying the audit/traceability intent of QuoteApproval (Document 02, Section 9) at the UI layer.
- **Action availability is strictly tied to the current version only:** Approve/Reject/Pay actions render exclusively on whichever version is currently non-superseded — never on a historical version, even if the customer navigates directly to its URL.

---

## 29. Design / PCB Service UX

Reuses the Manufacturing UX pattern (Sections 23–28) directly, with these differences:

- **Service Landing:** explains design/PCB services specifically — schematic review, PCB layout, design iteration — rather than physical production.
- **Request Design (equivalent of Request Manufacturing):** a simpler intake form than Manufacturing's, since design requests are scoped to design work, not production — sections narrow to: Project Overview, Design Scope (schematic-only, PCB layout, or both), Reference Files, Additional Notes. No Quantity/Dimensions/Materials/Manufacturing Requirements sections, since those belong to physical production, not design work.
- **Files:** reference files (existing schematics, rough sketches) uploaded at request time; **deliverable files** (finished schematics/PCB files) appear in the same Files tab once delivered, clearly distinguished (an "Uploaded by you" vs. "Delivered to you" visual grouping in FileList).
- **Status model, Quote UX, Version UX:** identical patterns to Manufacturing (Sections 25, 27, 28), since Document 01 defines the Design lifecycle as structurally the same as Manufacturing (DESIGN-001).
- **Follow-on to Manufacturing:** once a Design request reaches Completed, its deliverable files screen shows a clearly labeled optional action: "Start a Manufacturing Request using these files" — pre-attaching the delivered design files to a new Manufacturing request form (Section 24) rather than requiring the customer to re-download and re-upload them. This directly implements Document 01's described customer journey (Journey D) without inventing new backend capability — it is a UI convenience that pre-fills the Files section of a new request.

---

## 30. Consultation UX

Deliberately the lightest-weight of the four service flows, matching Document 01's "structured/asynchronous" scope (CONSULT-001).

- **Consultation discovery:** a Landing page explaining what consultation covers and setting expectations that responses are asynchronous (not scheduled calls or live chat).
- **Request:** a single-section form — Topic (short text), Description (free text), optional file attachment — deliberately simpler than the Manufacturing form's multi-section structure, since a consultation request is inherently less structured.
- **Submission confirmation:** a simple confirmation screen/Toast, routing to the Request Details screen.
- **Status:** Submitted → In Progress → Responded → Completed (or Closed), shown via the same Stepper/StatusBadge pattern as other services, but with fewer total steps.
- **Discussion/clarification:** reuses the Clarification UX pattern (Section 26) for any back-and-forth, since Document 01 does not distinguish consultation's communication mechanism from the others.
- **Conversion to a quoted engagement:** if the admin converts the consultation into billable work, the Request Details screen shows a clear banner: "This consultation has led to a proposed engagement" with a link to the resulting Quote (Section 27) — the consultation record itself remains, now cross-referenced rather than replaced.
- **Completion:** a simple "Mark as Resolved" action available to the customer if they consider their question answered, in addition to the admin's own ability to mark it Completed/Closed.

---

## 31. Software / Firmware Service UX

Reuses the Manufacturing/Design UX pattern with these differences:

- **Service Landing:** frames the offering explicitly as support *for a hardware/electronics project already underway on (or connected to) VenopAI* — the copy structure (not exact wording) should make clear this is not a general freelance-development marketplace (SW-002), e.g., by referencing "your project" and linking outward to Manufacturing/Design rather than presenting as a standalone dev-shop.
- **Request form sections:** Project Description, Requirements (free text), Platform/Technology context (optional structured field — e.g., target microcontroller/board, if known — since this materially affects scope, unlike a generic software brief), Reference Files, Additional Notes.
- **Files, Status, Quote, Version UX:** identical shared patterns to Sections 25/27/28.
- **Deliverables:** delivered as files in the Files tab (source/binary archives), consistent with Document 01 §16's accepted file types — no in-browser code review/diff tooling is introduced, since that is not a Document 01 or Document 02 capability.

---

## 32. Project & Project Files UX

- **Project list screen:** a simple list of the customer's Projects (name + linked-request count + rollup status, e.g., "2 active, 1 completed"), with a "Create Project" action (name only — no other fields, matching Document 02's "lightweight grouping" resolution).
- **Project details screen:** shows every linked request (any of Manufacturing/Design/Consultation/Software) as ServiceCards, plus an aggregated Files view spanning all linked requests' files.
- **Linking a request to a project:** available from within any Request Details screen ("Add to a Project" action, selecting an existing Project or creating a new one inline) — not required at request-submission time, since a customer may not know in advance that two requests belong together.
- **Project Files (top-level account screen):** a cross-request file library view — functionally a filtered FileList across every request the customer owns, filterable by request type and by uploaded-vs-delivered — provided as a convenience so a customer doesn't need to remember which specific request a given file lives under.
- **No independent Project-level file upload:** every file is still uploaded within a specific request's Files tab (per FILE-002's "every file must be associated with a specific request" — restated from Document 01), and merely surfaces in the Project-level rollup view; Projects do not become a second, competing place to upload unassociated files.

---

## 33. Reviews UX

- **Eligibility-gated entry point:** a "Leave a Review" action appears only on a delivered Order (per product) or a Completed service request — it is simply absent (not shown as disabled) everywhere else, avoiding a confusing greyed-out button with no explanation.
- **Review form:** a 1–5 star selector (required) plus an optional free-text field, presented as a lightweight Modal/bottom-sheet rather than a full-page navigation.
- **My Reviews screen:** lists the customer's own submitted reviews with their rating, text, target (product or service request), and an Edit/Delete action shown only within the permitted window (Document 01, Section 34 open question — the exact window is a controlled UX assumption pending confirmation, shown here as a simple "You can edit this review until [date]" note once decided).
- **Public display:** on Product Details (a Reviews section below specifications, showing average rating + individual reviews) and, where applicable, on service landing pages (aggregate rating only, not individual customer-identifying review text, to avoid implying public case-study consent that wasn't explicitly given) — this latter restriction is a controlled UX assumption protecting customer privacy beyond what Document 01 explicitly specifies, since service reviews may reference project specifics.
- **Moderation reflection:** a review hidden by an administrator (REV-003) simply does not appear publicly; the reviewing customer still sees their own review in "My Reviews" with a small note ("Not currently visible") rather than it silently vanishing from their own view, which would be confusing/alarming without explanation.

---

## 34. Notifications UX

Per NOTIF-001 (email-only), the in-app "Notifications" screen is explicitly a **send-history log**, not an interactive notification inbox/center (no mark-as-read, no in-app push, no bell-icon unread-count) — this is a deliberate scope boundary matching Document 01's exclusion of an in-app notification center (Section 31, future roadmap).

- **List:** each row shows the notification's subject/event type, the date sent, and delivery status (Sent/Failed — mirrored from Document 02 §17's `Notification` record).
- **No actions beyond viewing:** clicking an entry may reveal a brief preview of what was sent (for the customer's own reference, e.g., "which email confirmed my order"), but there is no reply, delete, or mark-as-read affordance, since none of that has a corresponding backend capability in V1.

---

## 35. Customer Settings UX

- **Password change:** current password + new password + confirm, standard validation, success Toast.
- **Notification email address:** the address the account's transactional emails go to — editable, with a re-verification step if changed (mirroring AUTH-001's verification requirement, applied consistently to any change of the address of record).
- **No other settings in V1:** no theme/appearance settings, no communication-preference toggles (since there is only one channel/one set of mandatory transactional events — Document 01 does not describe optional/marketing email a customer could opt out of), keeping this screen intentionally minimal rather than manufacturing settings that don't map to a real backend capability.

---

## 36. Admin Information Architecture & Navigation

The Admin console is a **separate shell** from the customer account (Document 02, Section 37's open question resolved here as: one Next.js codebase, a distinct route-group and layout, never sharing the customer sidebar/branding treatment) — this avoids any risk of an admin mistaking their view for a "customer account with extra tabs," reinforcing the RBAC boundary visually as well as functionally.

- **Sidebar:** reflects the Admin IA (Section 3), filtered per the logged-in admin's role permissions (Document 02, Section 21) — a role only ever sees sidebar entries for domains it has at least read access to.
- **Top bar:** current admin's name/role badge, logout, and a global "quick search" limited to admin-relevant lookups (order number, request ID, customer email) — not the customer-facing product search.
- **No public/customer navigation elements** (no "View Storefront" link cluttering the primary nav) beyond a small utility link, since the admin console's job is operating the business, not browsing it.

---

## 37. Admin Dashboard

Mirrors the customer Dashboard's "action surface" philosophy (Section 22), scoped to the logged-in admin's role:

- **Queues relevant to the admin's role**, e.g.: an `ORDER_MANAGER` sees "New Orders," "Shipping Exceptions," "Low Stock Alerts"; a `MANUFACTURING_MANAGER` sees "New Requests Awaiting Review," "Quotes Awaiting Customer Response" (informational), "Requests in Clarification"; a `FINANCE_MANAGER` sees "Pending Payment Verifications," "Refunds to Process"; a `SUPPORT_EXECUTIVE` sees "Flagged Reviews," "Recent Support-Relevant Orders/Requests"; `SUPER_ADMIN` sees a rolled-up view across all of the above.
- **Each queue item is directly actionable** — clicking a "New Order" queue item opens that Order's admin detail screen, not just a read-only summary — matching the explicit instruction that this must be operationally useful, not a chart wall.
- **A small set of headline operational metrics** (e.g., today's order count, open request count) may appear above the queues, but strictly secondary to the actionable queues themselves.

---

## 38. Admin Catalog & Inventory Management

- **Product list (DataTable):** name, category, price, stock status, active/inactive toggle; filter by category/status; search by name.
- **Product create/edit form:** name, description, specifications (structured key-value repeatable fields), price, category assignment (multi-select), images (FileUploader, public-media path per Document 02 §16), status (Draft/Active/Inactive).
- **Category management:** a simple two-level tree editor (add/edit/reorder/hide), matching the CAT-010/011 two-level constraint.
- **Inventory screen:** per-product stock quantity, reserved quantity (read-only, system-managed), available quantity (computed, read-only), a manual "Adjust Stock" action requiring a reason (Document 01 §21 "inventory correction," logged to Audit).
- **Reservation visibility:** an admin-only view of currently active reservations (for troubleshooting a customer's "why can't I check out" report), showing quantity and expiry countdown — read-only, since reservations are system-managed (Document 02 §12).

---

## 39. Admin Orders & Shipping Management

- **Orders list (DataTable):** order number, customer, status, payment status, total, date; filters by status/date range; search by order number or customer email.
- **Order detail (admin view):** everything the customer sees (Section 19/20) plus internal-only fields — full customer contact info, internal notes field, and status-transition controls (Processing → Ready to Ship → Shipped) gated to `ORDER_MANAGER`/`SUPER_ADMIN`.
- **Cancellation/refund initiation:** an `ORDER_MANAGER` can flag an order for cancellation (pre-fulfillment only, per ORD-003), which routes to `FINANCE_MANAGER` for the actual refund action (Section 40) — the UI reflects this handoff explicitly rather than letting one role complete both steps, matching the role separation in Document 01 Section 20.
- **Shipments list/detail:** per-shipment status, tracking number, a "Create Shipment" action (available once an order is Ready to Ship), and a dedicated "Shipping Exceptions" filtered view surfacing anything needing manual resolution (Document 02 §15, SHIP-004).

---

## 40. Admin Payments & Refunds Management

Scoped to `FINANCE_MANAGER` (and `SUPER_ADMIN`).

- **Payments list (DataTable):** transaction reference, linked order/quote, amount, status, date; a distinct filtered view for "Pending > threshold" (surfacing the reconciliation candidates from Document 02 §14/§19).
- **Payment detail:** full gateway reference info, verification timestamp, linked order/quote, and an "Issue Refund" action (amount field, defaulting to full but editable for partial refunds, reason field) — visible only once a payment is Successful.
- **Refunds list:** refund records with status (Initiated/Completed), linked payment, and processing date.
- **Invoices:** a searchable list of generated invoices with download access, mirroring the customer-facing invoice but with admin-level search/filter across all customers.

---

## 41. Admin Manufacturing / Design / Software / Consultation Management

Scoped to `MANUFACTURING_MANAGER` (and `SUPER_ADMIN`); one consistent screen pattern across all four request types, differing only in the type-specific fields collected at submission (Sections 24, 29, 31).

- **Request queue (DataTable):** request ID, customer, type, status, submitted date, days-in-current-status (a useful operational signal not present in the customer view); filter by status/type; sort by oldest-first to surface aging requests.
- **Request detail (admin view):** everything the customer sees, plus: an internal-only notes field, a "Raise Clarification Question" action (Section 26, admin side — composing the numbered question the customer will see), a "Confirm Requirements" action (transitions to Requirement Confirmed), and a "Create Quote" action (Section 42).
- **Status transition controls:** explicit buttons for each valid forward transition per the Document 01 §22 state model — no free-text status field, preventing an admin from accidentally setting an invalid state.
- **Execution status notes:** a simple free-text "post an update" action visible to the customer as the plain-language status notes referenced in Section 23's Manufacturing Progress screen.
- **Cancellation review queue:** a distinct filtered view for "Cancellation Requested" items (post-execution-start cancellations per MFG-006), requiring an explicit admin decision (approve with refund terms, or decline) rather than an automatic action.

---

## 42. Admin Quote Management

- **Quote creation form (from within a Request detail):** scope description (rich text), line items (description + amount, repeatable), tax treatment, shipping amount (if physical), estimated timeline, validity period (date picker), terms/notes (rich text) — "Send Quote" transitions it to Sent.
- **Quote revision:** a "Revise Quote" action available on any non-terminal quote; opens the same form pre-filled with the current version's values, and on save creates a new version and marks the prior one Superseded (Document 02 §11) — the UI makes this consequence explicit with a confirmation step: "This will create Version 2 and supersede the current version. The customer will need to approve the new version."
- **Approval history view:** a read-only log of every approval/rejection event across all versions (QuoteApproval records), for dispute resolution.
- **Quote conversion metrics (lightweight):** shown per-admin or in aggregate on the Analytics screen (Section 45), not duplicated here.

---

## 43. Admin Files Management

Scoped by role to whichever request types that role manages.

- **File list (within a Request detail's Files tab, admin view):** identical to the customer's FileList but including scan-status detail (Pending Scan/Clean/Flagged) and an admin-only "Upload Deliverable" action, clearly distinguished from customer-uploaded reference files (matching the "Uploaded by you / Delivered to you" grouping from Section 29, mirrored here as "Customer Upload / Team Deliverable").
- **Flagged file handling:** a flagged (failed malware scan) file shows a clear warning to the admin and is never downloadable, with a note directing the admin to ask the customer to re-upload.

---

## 44. Admin Reviews Moderation

Scoped to `SUPPORT_EXECUTIVE`/`SUPER_ADMIN`.

- **Reviews list (DataTable):** rating, target (product/service), customer, date, current visibility (Visible/Hidden); filter by visibility/rating.
- **Moderation action:** a "Hide" / "Restore" toggle with a required reason field when hiding — the underlying review record is never deleted from this screen (REV-003), only its visibility flag changes.

---

## 45. Admin Analytics

Scoped per role's relevant slice (Document 01, Section 28) — `FINANCE_MANAGER` sees financial reporting, `ORDER_MANAGER` sees order/inventory reporting, `MANUFACTURING_MANAGER` sees request/quote-conversion reporting, `SUPER_ADMIN` sees everything.

- Simple chart + summary-number widgets (orders over time, revenue split commerce-vs-service, quote conversion funnel, inventory low-stock count, request volume by stage) — deliberately using standard, unambiguous chart types (line/bar) rather than a "flashy dashboard," per Section 7's practical-over-decorative principle.
- No drill-down business-intelligence tooling, custom report builder, or export scheduling — none of that is a Document 01/02 requirement; a simple CSV export action on each table is a reasonable, low-cost controlled UX assumption for operational usability.

---

## 46. Admin Audit Logs

Scoped to `SUPER_ADMIN` (and a role viewing only its own actions, where relevant).

- **Log list (DataTable):** timestamp, acting admin (or "system"), action description, affected entity (with a direct link to that entity's detail screen), filterable by admin/date range/entity type.
- **Read-only:** no edit/delete affordance exists anywhere on this screen, reflecting AUDIT-001's immutability at the UI layer as well as the database layer.

---

## 47. Admin Roles & Permission UX

Scoped to `SUPER_ADMIN` only.

- **Admin user list:** name, email, assigned role, active/deactivated status.
- **Admin user detail:** role assignment (a single select from the five fixed V1 roles — Document 02 §21 — not a custom-permission builder, since Document 01 does not call for configurable RBAC in V1), activate/deactivate toggle.
- **No custom permission editing UI:** the five roles and their permission sets are fixed by Document 02; this screen assigns a role to a person, it does not let `SUPER_ADMIN` redefine what a role can do — consistent with Document 01 Section 31 deferring "configurable RBAC" to a future release.

---

## 48. Accessibility Requirements

- **Color contrast:** all text/background combinations meet at least WCAG AA contrast ratios, particularly for StatusBadge colors, which must remain distinguishable to color-blind users via label text, not color alone.
- **Keyboard navigation:** every interactive element (including multi-step forms, modals, and the FileUploader) is fully operable via keyboard, with a visible focus indicator at all times.
- **Screen reader support:** semantic HTML/ARIA roles for all custom components (Stepper, Timeline, StatusBadge, Modal/Drawer) so assistive technology announces current step, status, and modal open/close state correctly.
- **Form errors:** announced programmatically (ARIA live regions) in addition to the inline visual error styling, so a screen-reader user is not left unaware why a submission failed.
- **Motion:** respects `prefers-reduced-motion`; the deliberately minimal animation set (Section 8) makes this easy to satisfy fully.
- **Touch targets:** a minimum comfortable tap-target size on all mobile interactive elements (buttons, checkboxes, StatusBadges that double as filters), reflecting the mobile-first strategy (Section 6).

---

## 49. Content & Microcopy Guidelines

- **Tone:** clear, plain, and calm — never hype-driven marketing language, never cutesy/jokey copy, consistent with "trustworthy, professional, engineering-first" (Section 7). Status and error messages state facts plainly ("Your reserved items have timed out") rather than softening or over-apologizing.
- **Technical terms:** used correctly and without unnecessary simplification where the audience is engineering-literate (product specifications, PCB terminology), but plain language is used for process/status communication (order/quote/request states) so a first-year student and an experienced hardware founder are equally well served.
- **Error messages:** always state what happened and, where possible, what to do next — never a bare error code alone in customer-facing UI (Document 02 §25's safe-message principle applied to copy).
- **Never overstate certainty:** payment and delivery messaging in particular never claims something is done/confirmed before the backend has actually verified it (Sections 18, 19).

---

## 50. Error & Empty State Catalog

A consolidated reference tying Document 02 §25's error categories to concrete UI treatments, so every screen handles them consistently rather than inventing a new pattern each time:

| Backend Category (Doc 02 §25) | UI Treatment |
|---|---|
| Validation error | Inline field-level error message, form not submitted |
| Authentication error | Redirect to Login with context-preserving message (Section 5) |
| Authorization error | Forbidden state (Section 10, item 6) |
| Not found | A dedicated "This item doesn't exist or you don't have access to it" state — deliberately worded to avoid confirming/denying existence of another customer's data |
| Conflict | A specific, situation-aware message (e.g., "This quote was just updated — please review the latest version") rather than a generic "conflict" label |
| Business rule violation | A specific, plain-language explanation of the rule (e.g., "This quote must be approved before payment") rather than a raw rule-code |
| External provider failure | ErrorState framed as "We're having trouble connecting to [payment/shipping] right now — please try again shortly," never blaming the customer |
| Rate limit | "You've tried this too many times — please wait a moment and try again" |
| Internal server error | Generic ErrorState with a retry action and a correlation ID visible in small print for support reference (Document 02 §24) |

Every list-type screen's Empty state (Section 10, item 3) pairs a plain statement of "nothing here yet" with the single most relevant next action for that screen (e.g., Orders → "Browse Products"; Manufacturing Requests → "Start a Manufacturing Request").

---

## 51. Performance & Perceived Performance

- **Skeleton loading** (Section 7/10) is used for every primary content area rather than a generic spinner, so the layout doesn't visibly "jump" once data arrives.
- **Optimistic UI is deliberately avoided for anything financial or state-critical** (cart quantity changes, payment, quote approval) — these always wait for a confirmed server response before updating, consistent with the platform-wide principle of never showing more certainty than the backend has verified (Section 18).
- **Optimistic UI is acceptable for low-stakes, easily reversible actions** (e.g., toggling a filter chip, expanding an accordion section) where instant feedback improves feel without risking a misleading state.
- **Pagination over infinite scroll** (Section 7) also serves a performance purpose — bounded page sizes keep list screens fast regardless of total catalog/admin-data size.

---

## 52. UI Acceptance Criteria

For each major flow, the interface must satisfy:

**Product Purchase**
1. A customer can complete Browse → Product → Cart → Checkout → Payment → Confirmation without encountering an undefined UI state.
2. At every step of Checkout, Subtotal/Shipping/Tax/Total are visible as four distinct labeled values.
3. The reservation countdown is visible from the Address step onward.
4. No screen ever displays "Order Paid"/"Order Confirmed" prior to verified backend confirmation.

**Manufacturing / Design / Software Requests**
1. A customer can submit a request without being shown fields irrelevant to their selected type (progressive disclosure works).
2. Every reachable request status maps to exactly one row in Section 25's table — no unlabeled/undefined status is ever rendered.
3. A superseded quote version can never be approved or paid from its own screen (the actions are absent, not merely disabled-without-explanation).
4. Cancellation is always visible; its exact behavior (instant vs. review-required) correctly reflects the request's current payment/execution stage.

**Admin Operations**
1. An admin never sees a sidebar entry, or successfully completes an action, outside their role's permitted domains (Section 21 of Doc 02, reflected here).
2. Every queue item on the Admin Dashboard is clickable and leads directly to the actionable detail screen.
3. Quote revision always shows the "this will create a new version and supersede the current one" confirmation before proceeding.

---

## 53. Screen-to-Requirement Traceability

```
Product Requirement (Document 01)
   ↓
Technical Capability (Document 02)
   ↓
Screen / UI State (this document)
   ↓
API Contract (Document 04)
   ↓
Acceptance Test (Document 01 §32, extended by Section 52 above)
```

Example trace: `QUOTE-003 (no silent modification of an approved quote) → Document 02 §11 (versioning: new version + supersede in one transaction) → Section 28 of this document (Version Indicator, Superseded banner, action-availability restricted to current version only) → Document 04: quote-revision endpoint returns the new version and marks the prior superseded → Acceptance test: "an approved quote's UI never allows approval/payment actions once a newer version exists."`

---

## 54. Out of Scope (UI)

Consistent with Document 01 Section 30 and Document 02 Section 36, the following UI patterns are explicitly excluded from V1:

- Live chat widgets or presence indicators anywhere in the product
- Real-time collaborative editing/annotation on files or designs
- A configurable/drag-and-drop dashboard or report builder
- Wishlist, product comparison, or social/community features
- Push notifications or an in-app notification inbox (email-only, per NOTIF-001)
- A native mobile app UI (responsive web only)
- AI-generated recommendations, chat assistants, or semantic search interfaces
- A custom permission/RBAC editor (fixed five roles only)

---

## 55. Open Questions / Controlled UX Assumptions

| Question | Why It Matters | Proposed Default | Decision Required? |
|---|---|---|---|
| Exact review edit/delete window shown to the customer | Affects Section 33 copy and control visibility | Mirror Document 01 §34's proposed 7-day default until confirmed | Yes (tracks Doc 01 §34) |
| Whether service reviews show individual review text publicly, or aggregate rating only | Protects customer/project privacy where Document 01 doesn't explicitly resolve this | Aggregate rating only for service landing pages; full text remains visible on the customer's own "My Reviews" and to admins | Yes |
| Whether admin CSV export exists on every admin table or a curated subset | Minor scope/cost question, not a business rule | Provide on Orders, Payments, and Manufacturing/Service request lists only (the highest-value operational exports); omit elsewhere in V1 | Yes |
| Public "About/Contact/FAQ/Terms/Privacy" pages — CMS-managed or static | Affects whether these need any admin editing UI at all | Static, developer-maintained content in V1 (no CMS screen) | Yes |
| Exact wording/threshold for the "Payment Requires Verification" timeout in Section 18 | Affects customer reassurance during a real edge case | A short fixed wait (e.g., 15–30 seconds) before switching from "Confirming…" to the verification-pending message | Yes |

---

## 56. Final V1 UX Contract

**VenopAI V1 UI/UX Contract**

VenopAI's interface presents one coherent engineering project-realization platform across three shells: a **public** marketing/discovery surface, an **authenticated customer account** unifying commerce and engineering-service history, and a **role-scoped admin console** for operating both sides of the business.

**Commerce UX** (Browse → Cart → Checkout → Payment → Confirmation → Tracking → Review) is fast, clear, and honest about inventory reservation and payment verification timing — never overstating certainty the backend hasn't confirmed.

**Engineering-service UX** (Request → Clarification → Quote → Approval → Payment → Execution → Delivery → Completion) is structured and asynchronous by design across Manufacturing, Design, Consultation, and Software — sharing one consistent screen pattern, status vocabulary, and quote/versioning presentation, so a customer who has used one service instantly understands the others.

**Quote versioning** is the single most rigorously specified UX pattern in this document: the current version is always unmistakable, superseded versions are always clearly historical, and approval/payment actions are structurally unavailable anywhere except the current version.

**Order/payment/shipment status** are always three visually distinct indicators, never collapsed into one ambiguous label, directly mirroring Document 01's ORD-002 at the interface level.

**The admin console** is a role-scoped operations tool built around actionable queues, not a decorative dashboard — every role sees exactly the domains Document 02's RBAC model grants it, and nothing more.

**V1 boundaries:** no live chat, no real-time collaboration, no native mobile app, no in-app notification center, no AI-driven recommendations or search, no configurable RBAC editor — matching Documents 01 and 02 exactly, with zero screens or interaction patterns introduced beyond what those two documents authorize.

**Architectural independence:** this document defines what the interface shows and how it behaves. It contains no visual design (colors/exact typography), no component code, and no API request/response shapes — Document 04 (API contracts) and the subsequent visual design phase must be built to satisfy the screens, states, and flows defined here without contradicting them.

**This document is the authoritative V1 UI/UX and screen specification for VenopAI.**
