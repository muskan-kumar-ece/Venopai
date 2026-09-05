"""payments and orders: payment reconciliation, order snapshotting, and webhook event deduplication

Revision ID: 0008_payments_and_orders
Revises: 0007_addresses_and_checkout
Create Date: 2026-09-06 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0008_payments_and_orders'
down_revision = '0007_addresses_and_checkout'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # --- 1. Reconcile orders table ---
    order_cols = [c['name'] for c in insp.get_columns('orders')]
    if 'order_number' not in order_cols:
        op.add_column('orders', sa.Column('order_number', sa.String(64), nullable=True))
        # Backfill order_number if any rows exist
        op.execute("UPDATE orders SET order_number = 'VNP-ORD-' || substr(CAST(id AS text), 1, 8) WHERE order_number IS NULL")
        try:
            op.alter_column('orders', 'order_number', nullable=False)
        except Exception:
            pass
        op.create_index('ix_orders_order_number', 'orders', ['order_number'], unique=True)

    if 'checkout_session_id' not in order_cols:
        op.add_column('orders', sa.Column('checkout_session_id', sa.UUID(), sa.ForeignKey('checkout_sessions.id'), nullable=True))
    if 'subtotal_paise' not in order_cols:
        op.add_column('orders', sa.Column('subtotal_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'shipping_rate_paise' not in order_cols:
        op.add_column('orders', sa.Column('shipping_rate_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'tax_type' not in order_cols:
        op.add_column('orders', sa.Column('tax_type', sa.String(20), nullable=False, server_default='GST'))
    if 'tax_amount_paise' not in order_cols:
        op.add_column('orders', sa.Column('tax_amount_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'cgst_amount_paise' not in order_cols:
        op.add_column('orders', sa.Column('cgst_amount_paise', sa.Integer(), nullable=True))
    if 'sgst_amount_paise' not in order_cols:
        op.add_column('orders', sa.Column('sgst_amount_paise', sa.Integer(), nullable=True))
    if 'igst_amount_paise' not in order_cols:
        op.add_column('orders', sa.Column('igst_amount_paise', sa.Integer(), nullable=True))
    if 'total_paise' not in order_cols:
        op.add_column('orders', sa.Column('total_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'shipping_address_id' not in order_cols:
        op.add_column('orders', sa.Column('shipping_address_id', sa.UUID(), sa.ForeignKey('addresses.id'), nullable=True))
    if 'shipping_address_snapshot' not in order_cols:
        op.add_column('orders', sa.Column('shipping_address_snapshot', sa.Text(), nullable=True))
    if 'paid_at' not in order_cols:
        op.add_column('orders', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))

    # --- 2. Reconcile order_items table ---
    order_item_cols = [c['name'] for c in insp.get_columns('order_items')]
    if 'product_name' not in order_item_cols:
        op.add_column('order_items', sa.Column('product_name', sa.String(500), nullable=True))
    if 'unit_price_paise' not in order_item_cols:
        op.add_column('order_items', sa.Column('unit_price_paise', sa.Integer(), nullable=True))
    if 'total_paise' not in order_item_cols:
        op.add_column('order_items', sa.Column('total_paise', sa.Integer(), nullable=True))

    # --- 3. Reconcile payments table ---
    payment_cols = [c['name'] for c in insp.get_columns('payments')]
    if 'user_id' not in payment_cols:
        op.add_column('payments', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
        op.create_index('ix_payments_user_id', 'payments', ['user_id'], unique=False)
    if 'checkout_session_id' not in payment_cols:
        op.add_column('payments', sa.Column('checkout_session_id', sa.UUID(), sa.ForeignKey('checkout_sessions.id'), nullable=True))
        op.create_index('ix_payments_checkout_session_id', 'payments', ['checkout_session_id'], unique=False)
    if 'razorpay_signature' not in payment_cols:
        op.add_column('payments', sa.Column('razorpay_signature', sa.String(255), nullable=True))
    if 'currency' not in payment_cols:
        op.add_column('payments', sa.Column('currency', sa.String(10), nullable=False, server_default='INR'))
    if 'error_code' not in payment_cols:
        op.add_column('payments', sa.Column('error_code', sa.String(100), nullable=True))
    if 'error_description' not in payment_cols:
        op.add_column('payments', sa.Column('error_description', sa.Text(), nullable=True))
    if 'confirmed_at' not in payment_cols:
        op.add_column('payments', sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in payment_cols:
        op.add_column('payments', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # --- 4. Reconcile refunds table ---
    refund_cols = [c['name'] for c in insp.get_columns('refunds')]
    if 'user_id' not in refund_cols:
        op.add_column('refunds', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
    if 'razorpay_refund_id' not in refund_cols:
        op.add_column('refunds', sa.Column('razorpay_refund_id', sa.String(100), nullable=True))
        op.create_index('ix_refunds_razorpay_refund_id', 'refunds', ['razorpay_refund_id'], unique=True)
    if 'updated_at' not in refund_cols:
        op.add_column('refunds', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # --- 5. Create processed_webhook_events table ---
    tables = insp.get_table_names()
    if 'processed_webhook_events' not in tables:
        op.create_table(
            'processed_webhook_events',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('event_id', sa.String(255), nullable=False),
            sa.Column('event_type', sa.String(100), nullable=False),
            sa.Column('provider', sa.String(50), nullable=False, server_default='razorpay'),
            sa.Column('payload', sa.Text(), nullable=True),
            sa.Column('processed_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_processed_webhook_events_event_id', 'processed_webhook_events', ['event_id'], unique=True)


def downgrade() -> None:
    pass
