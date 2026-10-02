"""add customer feedback table

Revision ID: 0016_customer_feedback
Revises: 0015_product_user_manual_url
Create Date: 2026-10-01 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '0016_customer_feedback'
down_revision = '0015_product_user_manual_url'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'feedbacks' not in tables:
        op.create_table(
            'feedbacks',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True, index=True),
            sa.Column('guest_name', sa.String(150), nullable=True),
            sa.Column('guest_email', sa.String(255), nullable=True),
            sa.Column('guest_phone', sa.String(50), nullable=True),
            sa.Column('feedback_type', sa.String(50), nullable=False, default='general_feedback', index=True),
            sa.Column('priority', sa.String(20), nullable=False, default='medium', index=True),
            sa.Column('status', sa.String(30), nullable=False, default='open', index=True),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('description', sa.Text, nullable=False),
            sa.Column('page_url', sa.String(500), nullable=True),
            sa.Column('browser_info', sa.String(500), nullable=True),
            sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('orders.id'), nullable=True, index=True),
            sa.Column('service_request_type', sa.String(50), nullable=True),
            sa.Column('service_request_id', UUID(as_uuid=True), nullable=True),
            sa.Column('screenshot_url', sa.String(1024), nullable=True),
            sa.Column('admin_notes', sa.Text, nullable=True),
            sa.Column('admin_response', sa.Text, nullable=True),
            sa.Column('resolved_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'feedbacks' in tables:
        op.drop_table('feedbacks')
