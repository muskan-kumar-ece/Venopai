"""add user_manual_url to products table

Revision ID: 0015_product_user_manual_url
Revises: 0014_product_video_url
Create Date: 2026-09-29 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0015_product_user_manual_url'
down_revision = '0014_product_video_url'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'products' in tables:
        product_cols = [c['name'] for c in insp.get_columns('products')]
        if 'user_manual_url' not in product_cols:
            op.add_column('products', sa.Column('user_manual_url', sa.String(1024), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'products' in tables:
        product_cols = [c['name'] for c in insp.get_columns('products')]
        if 'user_manual_url' in product_cols:
            op.drop_column('products', 'user_manual_url')
