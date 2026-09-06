"""phase 10: review target architecture

Revision ID: 0011_phase10_review_target
Revises: 0010_phase9_services
Create Date: 2026-09-06 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0011_phase10_review_target'
down_revision = '0010_phase9_services'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'reviews' in tables:
        review_cols = [c['name'] for c in insp.get_columns('reviews')]
        if 'target_type' not in review_cols:
            op.add_column('reviews', sa.Column('target_type', sa.String(50), nullable=False, server_default='order_item'))
        if 'target_id' not in review_cols:
            op.add_column('reviews', sa.Column('target_id', sa.UUID(), nullable=True))
        if 'is_visible' not in review_cols:
            op.add_column('reviews', sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.true()))
        if 'moderation_reason' not in review_cols:
            op.add_column('reviews', sa.Column('moderation_reason', sa.Text(), nullable=True))
        if 'updated_at' not in review_cols:
            op.add_column('reviews', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        
        try:
            op.alter_column('reviews', 'product_id', existing_type=sa.UUID(), nullable=True)
        except Exception:
            pass
    else:
        op.create_table(
            'reviews',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('target_type', sa.String(50), nullable=False, server_default='order_item'),
            sa.Column('target_id', sa.UUID(), nullable=False),
            sa.Column('product_id', sa.UUID(), sa.ForeignKey('products.id'), nullable=True),
            sa.Column('rating', sa.Integer(), nullable=False),
            sa.Column('comment', sa.Text(), nullable=True),
            sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('moderation_reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint('user_id', 'target_type', 'target_id', name='uq_reviews_user_target'),
        )

def downgrade() -> None:
    pass
