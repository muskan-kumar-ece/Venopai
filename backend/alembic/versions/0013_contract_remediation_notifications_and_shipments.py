"""contract remediation: notifications delivery fields and shipments carrier/eta

Revision ID: 0013_contract_remediation_notifications_and_shipments
Revises: 0012_phase11_staging_reconciliation
Create Date: 2026-09-25 19:35:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0013_contract_remediation_notifications_and_shipments'
down_revision = '0012_phase11_staging_reconciliation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    # 1. Notifications table delivery tracking fields
    if 'notifications' in tables:
        notif_cols = [c['name'] for c in insp.get_columns('notifications')]
        if 'event_type' not in notif_cols:
            op.add_column('notifications', sa.Column('event_type', sa.String(100), nullable=False, server_default='general'))
            op.create_index('ix_notifications_event_type', 'notifications', ['event_type'])
        if 'status' not in notif_cols:
            op.add_column('notifications', sa.Column('status', sa.String(50), nullable=False, server_default='pending'))
            op.create_index('ix_notifications_status', 'notifications', ['status'])
        if 'failure_reason' not in notif_cols:
            op.add_column('notifications', sa.Column('failure_reason', sa.Text(), nullable=True))
        if 'retry_count' not in notif_cols:
            op.add_column('notifications', sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'))
        if 'sent_at' not in notif_cols:
            op.add_column('notifications', sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True))
        if 'idempotency_key' not in notif_cols:
            op.add_column('notifications', sa.Column('idempotency_key', sa.String(255), nullable=True))
            op.create_index('ix_notifications_idempotency_key', 'notifications', ['idempotency_key'], unique=True)

    # 2. Shipments table carrier, estimated delivery, and manufacturing deliverable link
    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]
        if 'carrier' not in ship_cols:
            op.add_column('shipments', sa.Column('carrier', sa.String(100), nullable=True))
        if 'estimated_delivery' not in ship_cols:
            op.add_column('shipments', sa.Column('estimated_delivery', sa.DateTime(timezone=True), nullable=True))
        if 'manufacturing_request_id' not in ship_cols:
            op.add_column('shipments', sa.Column('manufacturing_request_id', sa.UUID(), nullable=True))
            try:
                op.create_foreign_key('fk_shipments_manufacturing_request_id', 'shipments', 'manufacturing_requests', ['manufacturing_request_id'], ['id'])
                op.create_unique_constraint('uq_shipments_manufacturing_request_id', 'shipments', ['manufacturing_request_id'])
            except Exception:
                pass
        
        # Alter order_id to nullable=True so shipments can be created for standalone manufacturing deliverables
        if 'order_id' in ship_cols:
            try:
                op.alter_column('shipments', 'order_id', existing_type=sa.UUID(), nullable=True)
            except Exception:
                pass

        try:
            op.create_index('ix_shipments_status', 'shipments', ['status'])
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'shipments' in tables:
        ship_cols = [c['name'] for c in insp.get_columns('shipments')]
        if 'carrier' in ship_cols:
            op.drop_column('shipments', 'carrier')
        if 'estimated_delivery' in ship_cols:
            op.drop_column('shipments', 'estimated_delivery')
        if 'manufacturing_request_id' in ship_cols:
            try:
                op.drop_constraint('fk_shipments_manufacturing_request_id', 'shipments', type_='foreignkey')
                op.drop_constraint('uq_shipments_manufacturing_request_id', 'shipments', type_='unique')
            except Exception:
                pass
            op.drop_column('shipments', 'manufacturing_request_id')
        try:
            op.drop_index('ix_shipments_status', table_name='shipments')
        except Exception:
            pass

    if 'notifications' in tables:
        notif_cols = [c['name'] for c in insp.get_columns('notifications')]
        if 'idempotency_key' in notif_cols:
            op.drop_index('ix_notifications_idempotency_key', table_name='notifications')
            op.drop_column('notifications', 'idempotency_key')
        if 'sent_at' in notif_cols:
            op.drop_column('notifications', 'sent_at')
        if 'retry_count' in notif_cols:
            op.drop_column('notifications', 'retry_count')
        if 'failure_reason' in notif_cols:
            op.drop_column('notifications', 'failure_reason')
        if 'status' in notif_cols:
            op.drop_index('ix_notifications_status', table_name='notifications')
            op.drop_column('notifications', 'status')
        if 'event_type' in notif_cols:
            op.drop_index('ix_notifications_event_type', table_name='notifications')
            op.drop_column('notifications', 'event_type')
