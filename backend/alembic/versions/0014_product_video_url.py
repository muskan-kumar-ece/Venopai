"""add video_url to products table

Revision ID: 0014_product_video_url
Revises: 0013_contract_remediation_notifications_and_shipments
Create Date: 2026-09-27 22:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0014_product_video_url'
down_revision = '0013_contract_remediation_notifications_and_shipments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'products' in tables:
        product_cols = [c['name'] for c in insp.get_columns('products')]
        if 'video_url' not in product_cols:
            op.add_column('products', sa.Column('video_url', sa.String(1024), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'products' in tables:
        product_cols = [c['name'] for c in insp.get_columns('products')]
        if 'video_url' in product_cols:
            op.drop_column('products', 'video_url')
