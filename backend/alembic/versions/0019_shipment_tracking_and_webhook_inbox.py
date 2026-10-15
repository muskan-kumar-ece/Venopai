"""live shipment tracking events and durable webhook inbox

Revision ID: 0019_shipment_tracking_and_webhook_inbox
Revises: 0018_shipping_labels_manifests_pickups
Create Date: 2026-10-14 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '0019_shipment_tracking_and_webhook_inbox'
down_revision = '0018_shipping_labels_manifests_pickups'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    # 1. Add tracking and exception columns to shipments
    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]

        if 'last_tracking_synced_at' not in ship_cols:
            op.add_column('shipments', sa.Column('last_tracking_synced_at', sa.DateTime(timezone=True), nullable=True))

        if 'tracking_exception_notes' not in ship_cols:
            op.add_column('shipments', sa.Column('tracking_exception_notes', sa.Text(), nullable=True))

        if 'raw_carrier_status' not in ship_cols:
            op.add_column('shipments', sa.Column('raw_carrier_status', sa.String(length=100), nullable=True))

    # 2. Create shipment_tracking_events table
    if 'shipment_tracking_events' not in tables:
        op.create_table(
            'shipment_tracking_events',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column('shipment_id', UUID(as_uuid=True), sa.ForeignKey('shipments.id', ondelete='CASCADE'), nullable=False),
            sa.Column('tracking_number', sa.String(length=100), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False),
            sa.Column('raw_status', sa.String(length=100), nullable=True),
            sa.Column('activity', sa.Text(), nullable=True),
            sa.Column('location', sa.String(length=255), nullable=True),
            sa.Column('carrier', sa.String(length=100), nullable=True),
            sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_shipment_tracking_events_shipment_id', 'shipment_tracking_events', ['shipment_id'])
        op.create_index('ix_shipment_tracking_events_tracking_number', 'shipment_tracking_events', ['tracking_number'])
        op.create_index('ix_shipment_tracking_events_status', 'shipment_tracking_events', ['status'])
        op.create_index('ix_shipment_tracking_events_occurred_at', 'shipment_tracking_events', ['occurred_at'])

    # 3. Create shipping_webhook_inbox table
    if 'shipping_webhook_inbox' not in tables:
        op.create_table(
            'shipping_webhook_inbox',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column('event_id', sa.String(length=255), nullable=False),
            sa.Column('provider', sa.String(length=50), server_default='shiprocket', nullable=False),
            sa.Column('shipment_id', UUID(as_uuid=True), sa.ForeignKey('shipments.id', ondelete='SET NULL'), nullable=True),
            sa.Column('event_type', sa.String(length=100), nullable=False),
            sa.Column('payload_json', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=50), server_default='pending', nullable=False),
            sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
            sa.Column('last_error', sa.Text(), nullable=True),
            sa.Column('provider_timestamp', sa.DateTime(timezone=True), nullable=True),
            sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_shipping_webhook_inbox_event_id', 'shipping_webhook_inbox', ['event_id'], unique=True)
        op.create_index('ix_shipping_webhook_inbox_shipment_id', 'shipping_webhook_inbox', ['shipment_id'])
        op.create_index('ix_shipping_webhook_inbox_status', 'shipping_webhook_inbox', ['status'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipping_webhook_inbox' in tables:
        op.drop_table('shipping_webhook_inbox')

    if 'shipment_tracking_events' in tables:
        op.drop_table('shipment_tracking_events')

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]
        if 'raw_carrier_status' in ship_cols:
            op.drop_column('shipments', 'raw_carrier_status')
        if 'tracking_exception_notes' in ship_cols:
            op.drop_column('shipments', 'tracking_exception_notes')
        if 'last_tracking_synced_at' in ship_cols:
            op.drop_column('shipments', 'last_tracking_synced_at')
