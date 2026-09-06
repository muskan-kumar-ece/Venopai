"""phase 10: review target architecture

Revision ID: 0011_phase10_review_target
Revises: 0010_phase9_services
Create Date: 2026-09-06 18:00:00.000000

"""
from alembic import op, context
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0011_phase10_review_target'
down_revision = '0010_phase9_services'
branch_labels = None
depends_on = None

def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column('reviews', sa.Column('target_type', sa.String(50), nullable=False, server_default='order_item'))
        op.add_column('reviews', sa.Column('target_id', sa.UUID(), nullable=False))
        op.alter_column('reviews', 'product_id', existing_type=sa.UUID(), nullable=True)
        op.add_column('reviews', sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.true()))
        op.add_column('reviews', sa.Column('moderation_reason', sa.Text(), nullable=True))
        op.add_column('reviews', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        op.create_unique_constraint('uq_reviews_user_target', 'reviews', ['user_id', 'target_type', 'target_id'])
        return

    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'reviews' in tables:
        review_cols = [c['name'] for c in insp.get_columns('reviews')]
        
        # 1. target_type (required / NOT NULL)
        if 'target_type' not in review_cols:
            op.add_column('reviews', sa.Column('target_type', sa.String(50), nullable=False, server_default='order_item'))
        else:
            op.alter_column('reviews', 'target_type', existing_type=sa.String(50), nullable=False)
        
        # 2. Existing reviews cleanup: Purge any legacy rows that have no valid target_id before setting NOT NULL
        if 'target_id' in review_cols:
            op.execute("DELETE FROM reviews WHERE target_id IS NULL")
            op.alter_column('reviews', 'target_id', existing_type=sa.UUID(), nullable=False)
        else:
            op.add_column('reviews', sa.Column('target_id', sa.UUID(), nullable=True))
            op.execute("DELETE FROM reviews WHERE target_id IS NULL")
            op.alter_column('reviews', 'target_id', existing_type=sa.UUID(), nullable=False)
            
        # 3. product_id must be nullable
        try:
            op.alter_column('reviews', 'product_id', existing_type=sa.UUID(), nullable=True)
        except Exception:
            pass

        # 4. is_visible, moderation_reason, updated_at
        if 'is_visible' not in review_cols:
            op.add_column('reviews', sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.true()))
        if 'moderation_reason' not in review_cols:
            op.add_column('reviews', sa.Column('moderation_reason', sa.Text(), nullable=True))
        if 'updated_at' not in review_cols:
            op.add_column('reviews', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

        # 5. Unique constraint uq_reviews_user_target
        existing_constraints = [c['name'] for c in insp.get_unique_constraints('reviews')]
        if 'uq_reviews_user_target' not in existing_constraints:
            op.create_unique_constraint('uq_reviews_user_target', 'reviews', ['user_id', 'target_type', 'target_id'])

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
