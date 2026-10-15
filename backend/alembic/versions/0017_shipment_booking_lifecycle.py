"""shipment booking lifecycle, provider identifiers, and reconciliation fields

Revision ID: 0017_shipment_booking_lifecycle
Revises: 0016_customer_feedback
Create Date: 2026-10-13 15:35:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0017_shipment_booking_lifecycle'
down_revision = '0016_customer_feedback'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]

        if 'shiprocket_shipment_id' not in ship_cols:
            op.add_column('shipments', sa.Column('shiprocket_shipment_id', sa.String(100), nullable=True))
            try:
                op.create_index('ix_shipments_shiprocket_shipment_id', 'shipments', ['shiprocket_shipment_id'])
            except Exception:
                pass

        if 'courier_company_id' not in ship_cols:
            op.add_column('shipments', sa.Column('courier_company_id', sa.Integer(), nullable=True))

        if 'booking_status' not in ship_cols:
            op.add_column('shipments', sa.Column('booking_status', sa.String(50), nullable=False, server_default='pending'))
            try:
                op.create_index('ix_shipments_booking_status', 'shipments', ['booking_status'])
            except Exception:
                pass

        if 'last_booking_error' not in ship_cols:
            op.add_column('shipments', sa.Column('last_booking_error', sa.Text(), nullable=True))

        if 'reconciliation_notes' not in ship_cols:
            op.add_column('shipments', sa.Column('reconciliation_notes', sa.Text(), nullable=True))

        if 'idempotency_key' not in ship_cols:
            op.add_column('shipments', sa.Column('idempotency_key', sa.String(255), nullable=True))
            try:
                op.create_index('ix_shipments_idempotency_key', 'shipments', ['idempotency_key'], unique=True)
            except Exception:
                pass

        # Ensure index on shiprocket_order_id and tracking_number if not existing
        existing_indices = [idx['name'] for idx in insp.get_indexes('shipments')]
        if 'ix_shipments_shiprocket_order_id' not in existing_indices:
            try:
                op.create_index('ix_shipments_shiprocket_order_id', 'shipments', ['shiprocket_order_id'])
            except Exception:
                pass

        if 'ix_shipments_tracking_number' not in existing_indices:
            try:
                op.create_index('ix_shipments_tracking_number', 'shipments', ['tracking_number'])
            except Exception:
                pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]
        existing_indices = [idx['name'] for idx in insp.get_indexes('shipments')]

        if 'ix_shipments_idempotency_key' in existing_indices:
            op.drop_index('ix_shipments_idempotency_key', table_name='shipments')
        if 'idempotency_key' in ship_cols:
            op.drop_column('shipments', 'idempotency_key')

        if 'reconciliation_notes' in ship_cols:
            op.drop_column('shipments', 'reconciliation_notes')

        if 'last_booking_error' in ship_cols:
            op.drop_column('shipments', 'last_booking_error')

        if 'ix_shipments_booking_status' in existing_indices:
            op.drop_index('ix_shipments_booking_status', table_name='shipments')
        if 'booking_status' in ship_cols:
            op.drop_column('shipments', 'booking_status')

        if 'courier_company_id' in ship_cols:
            op.drop_column('shipments', 'courier_company_id')

        if 'ix_shipments_shiprocket_shipment_id' in existing_indices:
            op.drop_index('ix_shipments_shiprocket_shipment_id', table_name='shipments')
        if 'shiprocket_shipment_id' in ship_cols:
            op.drop_column('shipments', 'shiprocket_shipment_id')
