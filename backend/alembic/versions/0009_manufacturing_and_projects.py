"""manufacturing and projects: manufacturing requests, clarifications, status updates, files, and quote versioning

Revision ID: 0009_manufacturing_and_projects
Revises: 0008_payments_and_orders
Create Date: 2026-09-06 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0009_manufacturing_and_projects'
down_revision = '0008_payments_and_orders'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # --- 1. Reconcile manufacturing_requests table ---
    mfg_cols = [c['name'] for c in insp.get_columns('manufacturing_requests')]
    if 'user_id' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
    if 'title' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('title', sa.String(255), nullable=True))
    if 'project_overview' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('project_overview', sa.Text(), nullable=True))
    if 'prototype_type' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('prototype_type', sa.String(100), nullable=True, server_default='pcb_assembly'))
    if 'quantity' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'))
    if 'technical_requirements' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('technical_requirements', sa.Text(), nullable=True))
    if 'dimensions' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('dimensions', sa.Text(), nullable=True))
    if 'materials' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('materials', sa.Text(), nullable=True))
    if 'pcb_hardware_details' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('pcb_hardware_details', sa.Text(), nullable=True))
    if 'manufacturing_requirements' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('manufacturing_requirements', sa.Text(), nullable=True))
    if 'delivery_requirements' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('delivery_requirements', sa.Text(), nullable=True))
    if 'additional_notes' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('additional_notes', sa.Text(), nullable=True))
    if 'cancellation_requested' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('cancellation_requested', sa.Boolean(), nullable=False, server_default='0'))
    if 'cancellation_reason' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    if 'cancellation_decision' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('cancellation_decision', sa.String(50), nullable=True))
    if 'cancellation_refund_paise' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('cancellation_refund_paise', sa.Integer(), nullable=True))
    if 'cancellation_notes' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('cancellation_notes', sa.Text(), nullable=True))
    if 'internal_notes' not in mfg_cols:
        op.add_column('manufacturing_requests', sa.Column('internal_notes', sa.Text(), nullable=True))

    # --- 2. Create manufacturing_clarifications table ---
    tables = insp.get_table_names()
    if 'manufacturing_clarifications' not in tables:
        op.create_table(
            'manufacturing_clarifications',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('manufacturing_requests.id'), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('raised_by_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('raised_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('status', sa.String(50), nullable=False, server_default='awaiting_response'),
            sa.Column('response_text', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('attached_file_ids', sa.Text(), nullable=True),
        )
        op.create_index('ix_manufacturing_clarifications_request_id', 'manufacturing_clarifications', ['request_id'])

    # --- 3. Create manufacturing_status_updates table ---
    if 'manufacturing_status_updates' not in tables:
        op.create_table(
            'manufacturing_status_updates',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('manufacturing_requests.id'), nullable=False),
            sa.Column('author_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('note', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_manufacturing_status_updates_request_id', 'manufacturing_status_updates', ['request_id'])

    # --- 4. Reconcile project_files table ---
    pf_cols = [c['name'] for c in insp.get_columns('project_files')]
    if 'owner_id' not in pf_cols:
        op.add_column('project_files', sa.Column('owner_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
    if 'filename' not in pf_cols:
        op.add_column('project_files', sa.Column('filename', sa.String(255), nullable=True))
    if 'content_type' not in pf_cols:
        op.add_column('project_files', sa.Column('content_type', sa.String(100), nullable=True, server_default='application/octet-stream'))
    if 'size_bytes' not in pf_cols:
        op.add_column('project_files', sa.Column('size_bytes', sa.Integer(), nullable=False, server_default='0'))
    if 'storage_ref' not in pf_cols:
        op.add_column('project_files', sa.Column('storage_ref', sa.String(500), nullable=True))
    if 'scan_status' not in pf_cols:
        op.add_column('project_files', sa.Column('scan_status', sa.String(50), nullable=False, server_default='clean'))
    if 'source' not in pf_cols:
        op.add_column('project_files', sa.Column('source', sa.String(50), nullable=False, server_default='customer_upload'))
    if 'association_type' not in pf_cols:
        op.add_column('project_files', sa.Column('association_type', sa.String(50), nullable=True, server_default='manufacturing'))
    if 'association_id' not in pf_cols:
        op.add_column('project_files', sa.Column('association_id', sa.UUID(), nullable=True))
        op.create_index('ix_project_files_association_id', 'project_files', ['association_id'])

    # --- 5. Reconcile quotes table ---
    quote_cols = [c['name'] for c in insp.get_columns('quotes')]
    if 'user_id' not in quote_cols:
        op.add_column('quotes', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
    if 'request_type' not in quote_cols:
        op.add_column('quotes', sa.Column('request_type', sa.String(50), nullable=False, server_default='manufacturing'))
    if 'request_id' not in quote_cols:
        op.add_column('quotes', sa.Column('request_id', sa.UUID(), sa.ForeignKey('manufacturing_requests.id'), nullable=True))
        op.create_index('ix_quotes_request_id', 'quotes', ['request_id'])

    # --- 6. Reconcile quote_versions table ---
    qv_cols = [c['name'] for c in insp.get_columns('quote_versions')]
    if 'status' not in qv_cols:
        op.add_column('quote_versions', sa.Column('status', sa.String(50), nullable=False, server_default='draft'))
    if 'scope_summary' not in qv_cols:
        op.add_column('quote_versions', sa.Column('scope_summary', sa.Text(), nullable=True))
    if 'line_items' not in qv_cols:
        op.add_column('quote_versions', sa.Column('line_items', sa.Text(), nullable=True))
    if 'subtotal_paise' not in qv_cols:
        op.add_column('quote_versions', sa.Column('subtotal_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'tax_paise' not in qv_cols:
        op.add_column('quote_versions', sa.Column('tax_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'tax_type' not in qv_cols:
        op.add_column('quote_versions', sa.Column('tax_type', sa.String(50), nullable=True))
    if 'shipping_amount_paise' not in qv_cols:
        op.add_column('quote_versions', sa.Column('shipping_amount_paise', sa.Integer(), nullable=False, server_default='0'))
    if 'estimated_timeline' not in qv_cols:
        op.add_column('quote_versions', sa.Column('estimated_timeline', sa.String(255), nullable=True))
    if 'valid_until' not in qv_cols:
        op.add_column('quote_versions', sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True))
    if 'terms' not in qv_cols:
        op.add_column('quote_versions', sa.Column('terms', sa.Text(), nullable=True))


def downgrade() -> None:
    pass
