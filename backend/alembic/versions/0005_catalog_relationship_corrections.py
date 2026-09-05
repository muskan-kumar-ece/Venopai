"""catalog relationship corrections: product categories M:N, variant attributes, and column cleanup

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

    # Migrate existing data and clean obsolete columns
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
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

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='products' AND column_name='price'
                ) THEN
                    UPDATE products SET price_paise = price * 100 WHERE (price_paise = 0 OR price_paise IS NULL) AND price IS NOT NULL;
                    ALTER TABLE products DROP COLUMN price;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='inventory' AND column_name='stock'
                ) THEN
                    UPDATE inventory SET stock_quantity = stock WHERE (stock_quantity = 0 OR stock_quantity IS NULL) AND stock IS NOT NULL;
                    ALTER TABLE inventory DROP COLUMN stock;
                END IF;
            END $$;
            """
        )
    else:
        # Cross-database / SQLite compatibility
        insp = sa.inspect(bind)
        cols = [c['name'] for c in insp.get_columns('products')]
        if 'category_id' in cols:
            op.execute(
                "INSERT OR IGNORE INTO product_categories (product_id, category_id, created_at) "
                "SELECT id, category_id, datetime('now') FROM products WHERE category_id IS NOT NULL;"
            )
        if 'price' in cols:
            op.execute(
                "UPDATE products SET price_paise = price * 100 WHERE (price_paise = 0 OR price_paise IS NULL) AND price IS NOT NULL;"
            )
        with op.batch_alter_table('products') as batch_op:
            if 'category_id' in cols:
                batch_op.drop_column('category_id')
            if 'price' in cols:
                batch_op.drop_column('price')

        inv_cols = [c['name'] for c in insp.get_columns('inventory')]
        if 'stock' in inv_cols:
            op.execute(
                "UPDATE inventory SET stock_quantity = stock WHERE (stock_quantity = 0 OR stock_quantity IS NULL) AND stock IS NOT NULL;"
            )
            with op.batch_alter_table('inventory') as batch_op:
                batch_op.drop_column('stock')

    # --- Basic variant attributes on product (Document 02 §9/§11) ---
    op.add_column('products', sa.Column('variant_attributes', sa.Text(), nullable=True))

    # --- Checkout session reference on reservation ---
    op.add_column('inventory_reservations', sa.Column('checkout_session_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_inventory_reservations_checkout_session_id', 'inventory_reservations', ['checkout_session_id'])


def downgrade() -> None:
    op.drop_index('ix_inventory_reservations_checkout_session_id', table_name='inventory_reservations')
    op.drop_column('inventory_reservations', 'checkout_session_id')
    op.drop_column('products', 'variant_attributes')

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.add_column('products', sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id'), nullable=True))
        op.add_column('products', sa.Column('price', sa.Integer(), nullable=True))
        op.add_column('inventory', sa.Column('stock', sa.Integer(), nullable=True))
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
    else:
        try:
            with op.batch_alter_table('products') as batch_op:
                batch_op.add_column(sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=True))
                batch_op.add_column(sa.Column('price', sa.Integer(), nullable=True))
            with op.batch_alter_table('inventory') as batch_op:
                batch_op.add_column(sa.Column('stock', sa.Integer(), nullable=True))
        except Exception:
            pass

    op.drop_index('ix_product_categories_category_id', table_name='product_categories')
    op.drop_index('ix_product_categories_product_id', table_name='product_categories')
    op.drop_table('product_categories')
