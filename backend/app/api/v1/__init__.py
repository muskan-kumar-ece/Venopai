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
