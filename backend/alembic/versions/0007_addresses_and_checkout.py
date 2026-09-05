"""addresses and checkout sessions: address schema reconciliation, checkout sessions, and indexes

Revision ID: 0007_addresses_and_checkout
Revises: 0006_search_and_cart
Create Date: 2026-09-06 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0007_addresses_and_checkout'
down_revision = '0006_search_and_cart'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # --- Reconcile addresses table columns ---
    bind = op.get_bind()
    insp = sa.inspect(bind)
    address_cols = [c['name'] for c in insp.get_columns('addresses')]

    if 'recipient_name' not in address_cols:
        op.add_column('addresses', sa.Column('recipient_name', sa.String(255), nullable=True))
        # Backfill recipient_name from title or placeholder if exists
        op.execute("UPDATE addresses SET recipient_name = coalesce(title, 'Recipient') WHERE recipient_name IS NULL")
    if 'phone' not in address_cols:
        op.add_column('addresses', sa.Column('phone', sa.String(50), nullable=True))
        op.execute("UPDATE addresses SET phone = '+919999999999' WHERE phone IS NULL")
    if 'pincode' not in address_cols:
        op.add_column('addresses', sa.Column('pincode', sa.String(20), nullable=True))
        if 'postal_code' in address_cols:
            op.execute("UPDATE addresses SET pincode = postal_code WHERE pincode IS NULL")
        else:
            op.execute("UPDATE addresses SET pincode = '500001' WHERE pincode IS NULL")
    if 'is_default' not in address_cols:
        op.add_column('addresses', sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'))
        if 'is_default_shipping' in address_cols:
            op.execute("UPDATE addresses SET is_default = is_default_shipping")
    if 'created_at' not in address_cols:
        op.add_column('addresses', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in address_cols:
        op.add_column('addresses', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    op.create_index('ix_addresses_user_id', 'addresses', ['user_id'])

    # --- Create checkout_sessions table ---
    op.create_table(
        'checkout_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('cart_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('carts.id'), nullable=False),
        sa.Column('address_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('addresses.id'), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='open'),
        sa.Column('subtotal_paise', sa.Integer(), nullable=False),
        sa.Column('shipping_rate_paise', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('shipping_eta_min_days', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('shipping_eta_max_days', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('tax_type', sa.String(20), nullable=False),
        sa.Column('tax_amount_paise', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cgst_amount_paise', sa.Integer(), nullable=True),
        sa.Column('sgst_amount_paise', sa.Integer(), nullable=True),
        sa.Column('igst_amount_paise', sa.Integer(), nullable=True),
        sa.Column('total_paise', sa.Integer(), nullable=False),
        sa.Column('reservation_expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_checkout_sessions_user_id', 'checkout_sessions', ['user_id'])
    op.create_index('ix_checkout_sessions_status', 'checkout_sessions', ['status'])
    op.create_index('ix_checkout_sessions_reservation_expires_at', 'checkout_sessions', ['reservation_expires_at'])


def downgrade() -> None:
    op.drop_index('ix_checkout_sessions_reservation_expires_at', table_name='checkout_sessions')
    op.drop_index('ix_checkout_sessions_status', table_name='checkout_sessions')
    op.drop_index('ix_checkout_sessions_user_id', table_name='checkout_sessions')
    op.drop_table('checkout_sessions')

    op.drop_index('ix_addresses_user_id', table_name='addresses')
    op.drop_column('addresses', 'updated_at')
    op.drop_column('addresses', 'created_at')
    op.drop_column('addresses', 'is_default')
    op.drop_column('addresses', 'pincode')
    op.drop_column('addresses', 'phone')
    op.drop_column('addresses', 'recipient_name')
