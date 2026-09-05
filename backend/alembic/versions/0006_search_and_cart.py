"""search and cart: indexes for cart items and PostgreSQL search

Revision ID: 0006_search_and_cart
Revises: 0005_catalog_relationship_corrections
Create Date: 2026-09-06 00:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0006_search_and_cart'
down_revision = '0005_catalog_relationship_corrections'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # --- Cart items index for rapid per-cart lookup ---
    op.create_index('ix_cart_items_cart_id', 'cart_items', ['cart_id'])
    op.create_index('ix_cart_items_cart_product', 'cart_items', ['cart_id', 'product_id'])

    # --- PostgreSQL full-text search index (Document 02 §5/§28) ---
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_products_fts
            ON products
            USING gin (
                to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
            );
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_products_fts;")

    op.drop_index('ix_cart_items_cart_product', table_name='cart_items')
    op.drop_index('ix_cart_items_cart_id', table_name='cart_items')
