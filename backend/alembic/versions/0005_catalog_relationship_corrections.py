"""catalog relationship corrections: product categories M:N and variant attributes

Revision ID: 0005_catalog_relationship_corrections
Revises: 0004_catalog_phase4
Create Date: 2026-09-05 23:55:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0005_catalog_relationship_corrections'
down_revision = '0004_catalog_phase4'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # NOT VERIFIED — PostgreSQL unavailable
    # --- product_categories M:N junction table ---
    op.create_table(
        'product_categories',
        sa.Column('product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('products.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_product_categories_product_id', 'product_categories', ['product_id'])
    op.create_index('ix_product_categories_category_id', 'product_categories', ['category_id'])

    # Migrate existing category_id references if present before dropping
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='products' AND column_name='category_id'
            ) THEN
                INSERT INTO product_categories (product_id, category_id, created_at)
                SELECT id, category_id, NOW()
                FROM products
                WHERE category_id IS NOT NULL
                ON CONFLICT DO NOTHING;

                ALTER TABLE products DROP COLUMN category_id;
            END IF;
        END $$;
        """
    )

    # --- Basic variant attributes on product (Document 02 §9/§11) ---
    op.add_column('products', sa.Column('variant_attributes', sa.Text(), nullable=True))

    # --- Checkout session reference on reservation ---
    op.add_column('inventory_reservations', sa.Column('checkout_session_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_inventory_reservations_checkout_session_id', 'inventory_reservations', ['checkout_session_id'])


def downgrade() -> None:
    op.drop_index('ix_inventory_reservations_checkout_session_id', table_name='inventory_reservations')
    op.drop_column('inventory_reservations', 'checkout_session_id')
    op.drop_column('products', 'variant_attributes')

    op.add_column('products', sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id'), nullable=True))
    op.execute(
        """
        UPDATE products p
        SET category_id = pc.category_id
        FROM (
            SELECT product_id, MIN(category_id) as category_id
            FROM product_categories
            GROUP BY product_id
        ) pc
        WHERE p.id = pc.product_id;
        """
    )

    op.drop_index('ix_product_categories_category_id', table_name='product_categories')
    op.drop_index('ix_product_categories_product_id', table_name='product_categories')
    op.drop_table('product_categories')
