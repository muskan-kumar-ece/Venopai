"""shipping labels, manifests, pickup scheduling, and operational reliability fields

Revision ID: 0018_shipping_labels_manifests_pickups
Revises: 0017_shipment_booking_lifecycle
Create Date: 2026-10-14 09:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '0018_shipping_labels_manifests_pickups'
down_revision = '0017_shipment_booking_lifecycle'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]

        # 1. Label tracking
        if 'label_url' not in ship_cols:
            op.add_column('shipments', sa.Column('label_url', sa.Text(), nullable=True))

        if 'label_generated_at' not in ship_cols:
            op.add_column('shipments', sa.Column('label_generated_at', sa.DateTime(timezone=True), nullable=True))

        if 'label_status' not in ship_cols:
            op.add_column('shipments', sa.Column('label_status', sa.String(50), nullable=False, server_default='pending'))
            try:
                op.create_index('ix_shipments_label_status', 'shipments', ['label_status'])
            except Exception:
                pass

        # 2. Manifest tracking
        if 'manifest_url' not in ship_cols:
            op.add_column('shipments', sa.Column('manifest_url', sa.Text(), nullable=True))

        if 'manifest_generated_at' not in ship_cols:
            op.add_column('shipments', sa.Column('manifest_generated_at', sa.DateTime(timezone=True), nullable=True))

        if 'manifest_status' not in ship_cols:
            op.add_column('shipments', sa.Column('manifest_status', sa.String(50), nullable=False, server_default='pending'))
            try:
                op.create_index('ix_shipments_manifest_status', 'shipments', ['manifest_status'])
            except Exception:
                pass

        # 3. Pickup scheduling tracking
        if 'pickup_token_number' not in ship_cols:
            op.add_column('shipments', sa.Column('pickup_token_number', sa.String(100), nullable=True))
            try:
                op.create_index('ix_shipments_pickup_token_number', 'shipments', ['pickup_token_number'])
            except Exception:
                pass

        if 'pickup_scheduled_date' not in ship_cols:
            op.add_column('shipments', sa.Column('pickup_scheduled_date', sa.DateTime(timezone=True), nullable=True))

        if 'pickup_status' not in ship_cols:
            op.add_column('shipments', sa.Column('pickup_status', sa.String(50), nullable=False, server_default='pending'))
            try:
                op.create_index('ix_shipments_pickup_status', 'shipments', ['pickup_status'])
            except Exception:
                pass

        if 'pickup_generated_at' not in ship_cols:
            op.add_column('shipments', sa.Column('pickup_generated_at', sa.DateTime(timezone=True), nullable=True))

        # 4. Last operation error
        if 'last_operation_error' not in ship_cols:
            op.add_column('shipments', sa.Column('last_operation_error', sa.Text(), nullable=True))

    # 5. ShippingManifests batch table
    if 'shipping_manifests' not in tables:
        op.create_table(
            'shipping_manifests',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('manifest_url', sa.Text(), nullable=True),
            sa.Column('shipment_ids', sa.Text(), nullable=True),
            sa.Column('order_ids', sa.Text(), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='generated'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipping_manifests' in tables:
        op.drop_table('shipping_manifests')

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]
        for col in [
            'last_operation_error',
            'pickup_generated_at',
            'pickup_status',
            'pickup_scheduled_date',
            'pickup_token_number',
            'manifest_status',
            'manifest_generated_at',
            'manifest_url',
            'label_status',
            'label_generated_at',
            'label_url',
        ]:
            if col in ship_cols:
                try:
                    op.drop_column('shipments', col)
                except Exception:
                    pass
