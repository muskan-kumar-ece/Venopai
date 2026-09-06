from fastapi import APIRouter
from app.api.v1 import (
    health,
    auth,
    users,
    admin_auth,
    catalog,
    admin_catalog,
    search,
    cart,
    addresses,
    checkout,
    payments,
    orders,
    webhooks,
    manufacturing,
    admin_manufacturing,
    projects,
    quotes,
    files,
    consultations,
    admin_consultations,
    design,
    admin_design,
    software,
    admin_software,
    reviews,
    admin_reviews,
    notifications,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin_auth.router, prefix="/admin/auth", tags=["admin-auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(catalog.router, tags=["catalog"])
api_router.include_router(admin_catalog.router, tags=["admin-catalog"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(cart.router, prefix="/cart", tags=["cart"])
api_router.include_router(addresses.router, prefix="/addresses", tags=["addresses"])
api_router.include_router(checkout.router, prefix="/checkout", tags=["checkout"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(payments.admin_router, prefix="/admin/payments", tags=["admin-payments"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

# Phase 8: Manufacturing, Projects, Quotes, Files
api_router.include_router(manufacturing.router, prefix="/manufacturing/requests", tags=["manufacturing"])
api_router.include_router(admin_manufacturing.router, prefix="/admin/manufacturing", tags=["admin-manufacturing"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["quotes"])
api_router.include_router(quotes.admin_router, prefix="/admin/quotes", tags=["admin-quotes"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(files.admin_router, prefix="/admin", tags=["admin-files"])

# Phase 9: Consultation, Design / PCB, Software / Firmware
api_router.include_router(consultations.router, prefix="/consultations", tags=["consultations"])
api_router.include_router(admin_consultations.router, prefix="/admin/consultations", tags=["admin-consultations"])
api_router.include_router(design.router, prefix="/design/requests", tags=["design"])
api_router.include_router(admin_design.router, prefix="/admin/design/requests", tags=["admin-design"])
api_router.include_router(software.router, prefix="/software/requests", tags=["software"])
api_router.include_router(admin_software.router, prefix="/admin/software/requests", tags=["admin-software"])

# Phase 10: Reviews and Notifications
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(admin_reviews.router, prefix="/admin/reviews", tags=["admin-reviews"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
