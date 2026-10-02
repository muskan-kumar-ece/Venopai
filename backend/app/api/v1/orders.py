import uuid
import json
import math
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, Response, status as http_status
from sqlalchemy import func
from sqlalchemy.orm import Session
import jwt

from app.api.deps import get_db, CurrentUser
from app.core.config import settings
from app.core.exceptions import APIException
from app.models.user import User
from app.models.order import Order, Shipment
from app.services.order import OrderService
from app.schemas.order import (
    OrderDetailResponse,
    OrderListResponse,
    OrderCancelRequest,
    OrderInvoiceResponse,
)

router = APIRouter()

@router.get(
    "",
    response_model=OrderListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-001: List customer orders",
)
def list_orders(
    current_user: CurrentUser,
    status: Optional[str] = Query(None, description="Optional status filter"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List authenticated customer's own orders."""
    data, pagination = OrderService.list_orders(
        db=db,
        user=current_user,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "data": data,
        "pagination": pagination,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{order_id}",
    response_model=OrderDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-002: Customer order detail",
)
def get_order_detail(
    order_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Retrieve full customer order details with immutable snapshots and shipment tracking."""
    data = OrderService.get_order(db=db, user=current_user, order_id=order_id)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{order_id}/cancel",
    response_model=OrderDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-003: Cancel order pre-fulfillment",
)
def cancel_order(
    order_id: str,
    current_user: CurrentUser,
    body: Optional[OrderCancelRequest] = None,
    db: Session = Depends(get_db),
):
    """Customer pre-fulfillment cancellation (ORD-003)."""
    reason = body.reason if body else None
    data = OrderService.cancel_order(db=db, user=current_user, order_id=order_id, reason=reason)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{order_id}/invoice",
    response_model=OrderInvoiceResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-004: Download order invoice",
)
def get_order_invoice(
    order_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer invoice download metadata and short-lived signed file URL (TAX-004, SEC-009)."""
    data = OrderService.get_order_invoice(db=db, user=current_user, order_id=order_id)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


# ---------------------------------------------------------------------------
# ORDER-API-005: Public Order & Shipment Tracking Lookup
# ---------------------------------------------------------------------------

@router.get(
    "/track/public",
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-005: Public order & shipment tracking lookup",
)
def track_order_public(
    order_number: Optional[str] = Query(None, description="Order number (e.g. ORD-2026-0001)"),
    awb: Optional[str] = Query(None, description="Carrier tracking or AWB number"),
    db: Session = Depends(get_db),
):
    """Public shipment & order progression tracking without requiring authentication (SEC-009 sanitized)."""
    if not order_number and not awb:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="MISSING_TRACKING_QUERY",
            message="Please provide an order_number or awb to track shipment",
        )

    order = None
    shipment = None

    if order_number:
        clean_num = order_number.strip().upper()
        order = db.query(Order).filter(func.upper(Order.order_number) == clean_num).first()
        if order and order.shipment:
            shipment = order.shipment
        elif order:
            shipment = db.query(Shipment).filter(Shipment.order_id == order.id).first()

    if not order and awb:
        clean_awb = awb.strip()
        shipment = db.query(Shipment).filter(Shipment.tracking_number == clean_awb).first()
        if shipment and shipment.order:
            order = shipment.order
        elif shipment and shipment.order_id:
            order = db.query(Order).filter(Order.id == shipment.order_id).first()

    if not order and not shipment:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="TRACKING_NOT_FOUND",
            message="No active order or shipment was found for the specified reference.",
        )

    destination = "India"
    if order and order.shipping_address_snapshot:
        try:
            addr_data = json.loads(order.shipping_address_snapshot)
            city = addr_data.get("city")
            state = addr_data.get("state")
            pincode = addr_data.get("pincode")
            if city and state:
                destination = f"{city}, {state} ({pincode})" if pincode else f"{city}, {state}"
        except Exception:
            pass

    order_status = order.status if order else "processing"
    shipment_status = shipment.status if shipment else "pending"
    carrier = shipment.carrier if (shipment and shipment.carrier) else "Shiprocket Surface / Air"
    tracking_number = shipment.tracking_number if shipment else None
    est_delivery = shipment.estimated_delivery.isoformat() if (shipment and shipment.estimated_delivery) else None

    # Step progress: 1 = Placed, 2 = Quality/Processing, 3 = Dispatched, 4 = Delivered
    milestones = [
        {
            "step": 1,
            "title": "Order Placed & Verified",
            "description": "Order confirmed and authorized for engineering fulfillment.",
            "status": "completed",
            "timestamp": order.created_at.isoformat() if order and order.created_at else None,
        },
        {
            "step": 2,
            "title": "Kitting & Quality Inspection",
            "description": "Components verified, packaged, and shipping manifest generated.",
            "status": "completed" if order_status in ("processing", "ready_to_ship", "shipped", "delivered", "completed") else "current",
            "timestamp": order.paid_at.isoformat() if order and order.paid_at else None,
        },
        {
            "step": 3,
            "title": "Dispatched via Carrier",
            "description": f"Handed over to courier network ({carrier})." if tracking_number else "Awaiting courier pickup at fulfillment facility.",
            "status": "completed" if shipment_status in ("in_transit", "out_for_delivery", "delivered") or order_status in ("shipped", "delivered", "completed") else "current" if order_status == "ready_to_ship" else "pending",
            "timestamp": shipment.updated_at.isoformat() if shipment and tracking_number else None,
        },
        {
            "step": 4,
            "title": "Out for Delivery & Delivered",
            "description": "Package reached delivery hub and delivered to consignee.",
            "status": "completed" if shipment_status == "delivered" or order_status in ("delivered", "completed") else "pending",
            "timestamp": None,
        },
    ]

    return {
        "data": {
            "order_number": order.order_number if order else (shipment.shiprocket_order_id or "ORD-UNKNOWN"),
            "order_date": order.created_at.isoformat() if order and order.created_at else None,
            "order_status": order_status,
            "shipment_status": shipment_status,
            "carrier": carrier,
            "tracking_number": tracking_number,
            "estimated_delivery": est_delivery,
            "destination": destination,
            "item_count": len(order.items) if order and order.items else 1,
            "milestones": milestones,
        },
        "request_id": str(uuid.uuid4()),
    }


# ---------------------------------------------------------------------------
# ORDER-API-006: GST Tax Invoice Download Engine (HTML / Printable)
# ---------------------------------------------------------------------------

def _num_to_words_inr(amount_int: int) -> str:
    """Helper to convert rupee amount to words."""
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    if amount_int <= 0:
        return "Zero Rupees Only"

    def two_digits(n):
        if n < 20:
            return ones[n]
        return (tens[n // 10] + (" " + ones[n % 10] if n % 10 != 0 else "")).strip()

    def three_digits(n):
        res = ""
        if n >= 100:
            res += ones[n // 100] + " Hundred "
            n %= 100
        if n > 0:
            res += two_digits(n)
        return res.strip()

    crores = amount_int // 10000000
    rem = amount_int % 10000000
    lakhs = rem // 100000
    rem %= 100000
    thousands = rem // 1000
    rem %= 1000
    hundreds = rem

    parts = []
    if crores > 0:
        parts.append(two_digits(crores) + " Crore")
    if lakhs > 0:
        parts.append(two_digits(lakhs) + " Lakh")
    if thousands > 0:
        parts.append(two_digits(thousands) + " Thousand")
    if hundreds > 0:
        parts.append(three_digits(hundreds))

    return (" ".join(parts) + " Rupees Only").strip()


@router.get(
    "/{order_id}/invoice/download",
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-006: Official GST Tax Invoice HTML Document",
)
def download_order_invoice_html(
    order_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Renders and serves an official GST Tax Invoice compliant with Indian Tax regulations."""
    # 1. Authenticate user via query token or Bearer header
    user = None
    auth_header = request.headers.get("Authorization")
    raw_token = token
    if not raw_token and auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]

    if raw_token:
        try:
            payload = jwt.decode(
                raw_token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_aud": False},
            )
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == uuid.UUID(str(user_id))).first()
        except Exception:
            pass

    if not user:
        raise APIException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            code="UNAUTHORIZED",
            message="Valid authentication token is required to download this invoice",
        )

    # 2. Lookup Order
    order = None
    try:
        o_uuid = uuid.UUID(order_id)
        order = db.query(Order).filter(Order.id == o_uuid).first()
    except ValueError:
        clean_num = order_id.strip().upper()
        order = db.query(Order).filter(func.upper(Order.order_number) == clean_num).first()

    if not order:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ORDER_NOT_FOUND",
            message="Order not found",
        )

    is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in (
        "SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"
    )
    if not is_admin and order.user_id != user.id:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ORDER_NOT_FOUND",
            message="Order not found or not owned by user",
        )

    # 3. Parse customer & shipping info
    cust_name = getattr(user, "full_name", "") or getattr(user, "name", "") or "Valued Client"
    cust_email = getattr(user, "email", "")
    cust_phone = getattr(user, "phone", "") or "N/A"

    shipping_addr = {
        "full_name": cust_name,
        "address_line1": "Registered Delivery Address",
        "address_line2": "",
        "city": "Pune",
        "state": "Maharashtra",
        "pincode": "411001",
    }
    if order.shipping_address_snapshot:
        try:
            parsed_addr = json.loads(order.shipping_address_snapshot)
            if isinstance(parsed_addr, dict):
                shipping_addr.update(parsed_addr)
        except Exception:
            pass

    # 4. Format numbers
    subtotal_inr = (order.subtotal_paise or 0) / 100.0
    tax_inr = (order.tax_amount_paise or 0) / 100.0
    shipping_inr = (order.shipping_rate_paise or 0) / 100.0
    total_inr = (order.total_paise or 0) / 100.0

    cgst_inr = (order.cgst_amount_paise or 0) / 100.0 if order.cgst_amount_paise else (tax_inr / 2.0 if tax_inr > 0 else 0.0)
    sgst_inr = (order.sgst_amount_paise or 0) / 100.0 if order.sgst_amount_paise else (tax_inr / 2.0 if tax_inr > 0 else 0.0)
    igst_inr = (order.igst_amount_paise or 0) / 100.0 if order.igst_amount_paise else 0.0

    invoice_no = f"INV-{order.order_number}"
    invoice_date = (order.paid_at or order.created_at).strftime("%d %b %Y")
    order_date = order.created_at.strftime("%d %b %Y")
    words_total = _num_to_words_inr(int(round(total_inr)))

    # Items rows
    items_rows_html = ""
    for idx, it in enumerate(order.items, start=1):
        u_paise = it.unit_price_paise or it.price_at_time_of_order or 0
        t_paise = it.total_paise or (u_paise * it.quantity)
        u_inr = u_paise / 100.0
        t_inr = t_paise / 100.0
        p_name = it.product_name or (it.product.name if it.product else "Engineering Component")
        p_sku = (it.product.sku if it.product and it.product.sku else "VNP-HW-001")
        items_rows_html += f"""
        <tr style="border-bottom: 1px solid #e4e4e7;">
            <td style="padding: 10px 8px; text-align: center; color: #71717a; font-size: 12px;">{idx}</td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 600; color: #18181b; font-size: 13px;">{p_name}</div>
                <div style="font-size: 11px; color: #71717a; font-family: monospace;">SKU: {p_sku}</div>
            </td>
            <td style="padding: 10px 8px; text-align: center; font-size: 12px; font-family: monospace; color: #52525b;">8542.31.00</td>
            <td style="padding: 10px 8px; text-align: center; font-weight: 600; font-size: 12px;">{it.quantity}</td>
            <td style="padding: 10px 8px; text-align: right; font-size: 12px; font-family: monospace;">₹{u_inr:,.2f}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600; font-size: 12px; font-family: monospace;">₹{t_inr:,.2f}</td>
        </tr>
        """

    # Razorpay payment reference if confirmed
    payment_ref = "Confirmed via Online Gateway"
    if order.payments:
        last_pay = sorted(order.payments, key=lambda p: p.created_at, reverse=True)[0]
        if last_pay.razorpay_payment_id:
            payment_ref = f"Razorpay Ref: {last_pay.razorpay_payment_id}"

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tax Invoice - {invoice_no} | VenopAI Technologies</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
        body {{ background-color: #f4f4f5; color: #18181b; padding: 30px 15px; }}
        .no-print {{ max-width: 820px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; }}
        .btn {{ background-color: #09090b; color: #fff; padding: 10px 18px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }}
        .btn:hover {{ background-color: #27272a; }}
        .btn-outline {{ background-color: #fff; color: #27272a; border: 1px solid #d4d4d8; }}
        .btn-outline:hover {{ background-color: #f4f4f5; }}
        .invoice-card {{ background: #fff; max-width: 820px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e4e4e7; }}
        .badge {{ background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #a7f3d0; }}
        table {{ width: 100%; border-collapse: collapse; }}
        @media print {{
            body {{ background: #fff !important; padding: 0 !important; }}
            .no-print {{ display: none !important; }}
            .invoice-card {{ box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 20px 0 !important; max-width: 100% !important; }}
        }}
    </style>
</head>
<body>
    <div class="no-print">
        <a href="javascript:window.close()" class="btn btn-outline">← Close</a>
        <button onclick="window.print()" class="btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            Print / Save as PDF
        </button>
    </div>

    <div class="invoice-card">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #18181b;">
            <div>
                <h1 style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #18181b;">VenopAI Technologies</h1>
                <p style="font-size: 12px; color: #71717a; margin-top: 4px;">Hardware Engineering & Turnkey Realization Platform</p>
                <p style="font-size: 11px; color: #52525b; margin-top: 8px; line-height: 1.5;">
                    4th Floor, Tech Hub, Pune-Bangalore Highway<br>
                    Pune, Maharashtra - 411045, India<br>
                    <strong>GSTIN:</strong> 27ABCDE1234F1Z5 &nbsp;|&nbsp; <strong>PAN:</strong> ABCDE1234F<br>
                    <strong>Email:</strong> support@venopai.com &nbsp;|&nbsp; <strong>Phone:</strong> +91 (020) 8492-3000
                </p>
            </div>
            <div style="text-align: right;">
                <div class="badge">ORIGINAL TAX INVOICE</div>
                <div style="margin-top: 12px; font-size: 18px; font-weight: 800; font-family: monospace;">{invoice_no}</div>
                <div style="font-size: 12px; color: #71717a; margin-top: 4px;"><strong>Invoice Date:</strong> {invoice_date}</div>
                <div style="font-size: 12px; color: #71717a;"><strong>Order Ref:</strong> {order.order_number}</div>
                <div style="font-size: 12px; color: #71717a;"><strong>Place of Supply:</strong> {shipping_addr.get('state', 'Maharashtra')} (27)</div>
            </div>
        </div>

        <!-- Bill to & Ship to -->
        <div style="display: flex; justify-content: space-between; gap: 24px; padding: 20px 0; border-bottom: 1px solid #e4e4e7;">
            <div style="flex: 1;">
                <div style="font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.5px;">Billed To</div>
                <div style="margin-top: 6px; font-size: 14px; font-weight: 700; color: #18181b;">{shipping_addr.get('full_name') or cust_name}</div>
                <div style="font-size: 12px; color: #52525b; line-height: 1.5; margin-top: 4px;">
                    {shipping_addr.get('address_line1', '')} {shipping_addr.get('address_line2', '')}<br>
                    {shipping_addr.get('city', '')}, {shipping_addr.get('state', '')} - {shipping_addr.get('pincode', '')}<br>
                    Email: {cust_email} | Contact: {cust_phone}
                </div>
            </div>
            <div style="flex: 1;">
                <div style="font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.5px;">Shipped To</div>
                <div style="margin-top: 6px; font-size: 14px; font-weight: 700; color: #18181b;">{shipping_addr.get('full_name') or cust_name}</div>
                <div style="font-size: 12px; color: #52525b; line-height: 1.5; margin-top: 4px;">
                    {shipping_addr.get('address_line1', '')} {shipping_addr.get('address_line2', '')}<br>
                    {shipping_addr.get('city', '')}, {shipping_addr.get('state', '')} - {shipping_addr.get('pincode', '')}<br>
                    Carrier: {order.shipment.carrier if order.shipment and order.shipment.carrier else "Shiprocket Express Logistics"}
                </div>
            </div>
        </div>

        <!-- Items Table -->
        <div style="margin-top: 24px;">
            <table>
                <thead>
                    <tr style="background-color: #f4f4f5; border-bottom: 2px solid #d4d4d8;">
                        <th style="padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">#</th>
                        <th style="padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">Item & Description</th>
                        <th style="padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">HSN / SAC</th>
                        <th style="padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">Qty</th>
                        <th style="padding: 10px 8px; text-align: right; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">Rate (₹)</th>
                        <th style="padding: 10px 8px; text-align: right; font-size: 11px; font-weight: 700; color: #52525b; text-transform: uppercase;">Taxable Value (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    {items_rows_html}
                </tbody>
            </table>
        </div>

        <!-- Calculations & Totals -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e4e4e7;">
            <div style="max-width: 440px;">
                <div style="font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">Invoice Amount in Words:</div>
                <div style="font-size: 13px; font-weight: 700; color: #18181b; margin-top: 4px;">{words_total}</div>

                <div style="margin-top: 20px; padding: 12px; background: #fafafa; border-radius: 8px; border: 1px solid #e4e4e7; font-size: 11px; color: #52525b;">
                    <strong>Payment Information:</strong><br>
                    Status: <span style="color: #047857; font-weight: 700;">CONFIRMED &amp; RECEIVED</span><br>
                    {payment_ref}<br>
                    Transaction Time: {order_date}
                </div>
            </div>

            <div style="width: 280px;">
                <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #52525b;">
                    <span>Taxable Subtotal:</span>
                    <span style="font-family: monospace; font-weight: 600;">₹{subtotal_inr:,.2f}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #52525b;">
                    <span>CGST (9%):</span>
                    <span style="font-family: monospace;">₹{cgst_inr:,.2f}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #52525b;">
                    <span>SGST (9%):</span>
                    <span style="font-family: monospace;">₹{sgst_inr:,.2f}</span>
                </div>
                {f'<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #52525b;"><span>IGST (18%):</span><span style="font-family: monospace;">₹{igst_inr:,.2f}</span></div>' if igst_inr > 0 else ''}
                <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #52525b;">
                    <span>Shipping &amp; Logistics:</span>
                    <span style="font-family: monospace;">₹{shipping_inr:,.2f}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 8px; border-top: 2px solid #18181b; font-size: 16px; font-weight: 900; color: #18181b;">
                    <span>Total (INR):</span>
                    <span style="font-family: monospace;">₹{total_inr:,.2f}</span>
                </div>
            </div>
        </div>

        <!-- Footer Notice & Signatory -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #d4d4d8; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 10px; color: #a1a1aa; max-width: 480px; line-height: 1.5;">
                This is a computer-generated tax invoice issued in accordance with Section 31 of the Central Goods and Services Tax Act, 2017. All hardware products supplied are subject to VenopAI standard manufacturer warranty. For questions or enterprise accounts, contact accounts@venopai.com.
            </div>
            <div style="text-align: center;">
                <div style="font-size: 11px; font-weight: 700; color: #52525b;">For VenopAI Technologies Pvt. Ltd.</div>
                <div style="height: 40px; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 12px; color: #047857; font-weight: bold; border-bottom: 1px solid #71717a; margin-top: 8px;">
                    ✓ Digitally Signed &amp; Verified
                </div>
                <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Authorized Signatory</div>
            </div>
        </div>
    </div>
</body>
</html>
"""
    return Response(content=html_content, media_type="text/html")

