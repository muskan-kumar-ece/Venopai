"""phase 9: consultation, design, and software services

Revision ID: 0010_phase9_services
Revises: 0009_manufacturing_and_projects
Create Date: 2026-09-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0010_phase9_services'
down_revision = '0009_manufacturing_and_projects'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    # --- 1. Reconcile consultation_requests ---
    if 'consultation_requests' in tables:
        consult_cols = [c['name'] for c in insp.get_columns('consultation_requests')]
        if 'user_id' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
        if 'topic' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('topic', sa.String(255), nullable=True))
        if 'description' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('description', sa.Text(), nullable=True))
        if 'converted_quote_id' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('converted_quote_id', sa.UUID(), nullable=True))
        if 'admin_response' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('admin_response', sa.Text(), nullable=True))
        if 'internal_notes' not in consult_cols:
            op.add_column('consultation_requests', sa.Column('internal_notes', sa.Text(), nullable=True))
    else:
        op.create_table(
            'consultation_requests',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=True),
            sa.Column('topic', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('status', sa.String(50), nullable=False, server_default='submitted'),
            sa.Column('converted_quote_id', sa.UUID(), nullable=True),
            sa.Column('admin_response', sa.Text(), nullable=True),
            sa.Column('internal_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )

    # --- 2. Create consultation_clarifications ---
    if 'consultation_clarifications' not in tables:
        op.create_table(
            'consultation_clarifications',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('consultation_requests.id'), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('raised_by_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('raised_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='awaiting_response'),
            sa.Column('response_text', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('attached_file_ids', sa.Text(), nullable=True),
        )

    # --- 3. Reconcile design_requests ---
    if 'design_requests' in tables:
        design_cols = [c['name'] for c in insp.get_columns('design_requests')]
        if 'user_id' not in design_cols:
            op.add_column('design_requests', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
        if 'title' not in design_cols:
            op.add_column('design_requests', sa.Column('title', sa.String(255), nullable=True))
        if 'project_overview' not in design_cols:
            op.add_column('design_requests', sa.Column('project_overview', sa.Text(), nullable=True))
        if 'design_scope' not in design_cols:
            op.add_column('design_requests', sa.Column('design_scope', sa.String(50), nullable=True, server_default='pcb_layout'))
        if 'additional_notes' not in design_cols:
            op.add_column('design_requests', sa.Column('additional_notes', sa.Text(), nullable=True))
        if 'cancellation_requested' not in design_cols:
            op.add_column('design_requests', sa.Column('cancellation_requested', sa.Boolean(), nullable=False, server_default='0'))
        if 'cancellation_reason' not in design_cols:
            op.add_column('design_requests', sa.Column('cancellation_reason', sa.Text(), nullable=True))
        if 'cancellation_decision' not in design_cols:
            op.add_column('design_requests', sa.Column('cancellation_decision', sa.String(50), nullable=True))
        if 'cancellation_refund_paise' not in design_cols:
            op.add_column('design_requests', sa.Column('cancellation_refund_paise', sa.Integer(), nullable=True))
        if 'cancellation_notes' not in design_cols:
            op.add_column('design_requests', sa.Column('cancellation_notes', sa.Text(), nullable=True))
        if 'internal_notes' not in design_cols:
            op.add_column('design_requests', sa.Column('internal_notes', sa.Text(), nullable=True))
    else:
        op.create_table(
            'design_requests',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=True),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('project_overview', sa.Text(), nullable=False),
            sa.Column('design_scope', sa.String(50), nullable=False, server_default='pcb_layout'),
            sa.Column('additional_notes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='submitted'),
            sa.Column('cancellation_requested', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('cancellation_reason', sa.Text(), nullable=True),
            sa.Column('cancellation_decision', sa.String(50), nullable=True),
            sa.Column('cancellation_refund_paise', sa.Integer(), nullable=True),
            sa.Column('cancellation_notes', sa.Text(), nullable=True),
            sa.Column('internal_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )

    # --- 4. Create design_clarifications & design_status_updates ---
    if 'design_clarifications' not in tables:
        op.create_table(
            'design_clarifications',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('design_requests.id'), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('raised_by_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('raised_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='awaiting_response'),
            sa.Column('response_text', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('attached_file_ids', sa.Text(), nullable=True),
        )

    if 'design_status_updates' not in tables:
        op.create_table(
            'design_status_updates',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('design_requests.id'), nullable=False),
            sa.Column('author_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('note', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        )

    # --- 5. Reconcile software_requests ---
    if 'software_requests' in tables:
        sw_cols = [c['name'] for c in insp.get_columns('software_requests')]
        if 'user_id' not in sw_cols:
            op.add_column('software_requests', sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True))
        if 'title' not in sw_cols:
            op.add_column('software_requests', sa.Column('title', sa.String(255), nullable=True))
        if 'project_description' not in sw_cols:
            op.add_column('software_requests', sa.Column('project_description', sa.Text(), nullable=True))
        if 'requirements' not in sw_cols:
            op.add_column('software_requests', sa.Column('requirements', sa.Text(), nullable=True))
        if 'platform_technology' not in sw_cols:
            op.add_column('software_requests', sa.Column('platform_technology', sa.String(255), nullable=True))
        if 'additional_notes' not in sw_cols:
            op.add_column('software_requests', sa.Column('additional_notes', sa.Text(), nullable=True))
        if 'cancellation_requested' not in sw_cols:
            op.add_column('software_requests', sa.Column('cancellation_requested', sa.Boolean(), nullable=False, server_default='0'))
        if 'cancellation_reason' not in sw_cols:
            op.add_column('software_requests', sa.Column('cancellation_reason', sa.Text(), nullable=True))
        if 'cancellation_decision' not in sw_cols:
            op.add_column('software_requests', sa.Column('cancellation_decision', sa.String(50), nullable=True))
        if 'cancellation_refund_paise' not in sw_cols:
            op.add_column('software_requests', sa.Column('cancellation_refund_paise', sa.Integer(), nullable=True))
        if 'cancellation_notes' not in sw_cols:
            op.add_column('software_requests', sa.Column('cancellation_notes', sa.Text(), nullable=True))
        if 'internal_notes' not in sw_cols:
            op.add_column('software_requests', sa.Column('internal_notes', sa.Text(), nullable=True))
    else:
        op.create_table(
            'software_requests',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=True),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('project_description', sa.Text(), nullable=False),
            sa.Column('requirements', sa.Text(), nullable=False),
            sa.Column('platform_technology', sa.String(255), nullable=True),
            sa.Column('additional_notes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='submitted'),
            sa.Column('cancellation_requested', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('cancellation_reason', sa.Text(), nullable=True),
            sa.Column('cancellation_decision', sa.String(50), nullable=True),
            sa.Column('cancellation_refund_paise', sa.Integer(), nullable=True),
            sa.Column('cancellation_notes', sa.Text(), nullable=True),
            sa.Column('internal_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )

    # --- 6. Create software_clarifications & software_status_updates ---
    if 'software_clarifications' not in tables:
        op.create_table(
            'software_clarifications',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('software_requests.id'), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('raised_by_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('raised_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='awaiting_response'),
            sa.Column('response_text', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('attached_file_ids', sa.Text(), nullable=True),
        )

    if 'software_status_updates' not in tables:
        op.create_table(
            'software_status_updates',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('request_id', sa.UUID(), sa.ForeignKey('software_requests.id'), nullable=False),
            sa.Column('author_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('note', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        )

def downgrade() -> None:
    pass
