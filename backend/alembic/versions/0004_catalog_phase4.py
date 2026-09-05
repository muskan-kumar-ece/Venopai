"""catalog phase4: upgrade catalog, product, inventory schema

Revision ID: 0004_catalog_phase4
Revises: auth_security_tokens_002
Create Date: 2026-09-05 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0004_catalog_phase4'
down_revision = 'auth_security_tokens_002'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # NOT VERIFIED — PostgreSQL unavailable
    # --- categories ---
    op.add_column('categories', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('categories', sa.Column('image_url', sa.String(length=1024), nullable=True))
    op.add_column('categories', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('categories', sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('categories', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('categories', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

    # --- products ---
    op.add_column('products', sa.Column('sku', sa.String(length=100), nullable=True))
    op.add_column('products', sa.Column('price_paise', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('products', sa.Column('compare_price_paise', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('cost_price_paise', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('status', sa.String(length=50), nullable=False, server_default='draft'))
    op.add_column('products', sa.Column('is_featured', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('products', sa.Column('images', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('specifications', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('weight_grams', sa.Integer(), nullable=True))
    
    op.create_index('ix_products_sku', 'products', ['sku'], unique=True)
    op.create_index('ix_products_status', 'products', ['status'])

    # --- inventory ---
    op.add_column('inventory', sa.Column('stock_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('inventory', sa.Column('reserved_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('inventory', sa.Column('reorder_point', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('inventory', sa.Column('version', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('inventory', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('inventory', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

    # --- inventory_reservations ---
    op.add_column('inventory_reservations', sa.Column('released_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_inventory_reservations_inventory_id', 'inventory_reservations', ['inventory_id'])
    op.create_index('ix_inventory_reservations_status', 'inventory_reservations', ['status'])


def downgrade() -> None:
    op.drop_index('ix_inventory_reservations_status', table_name='inventory_reservations')
    op.drop_index('ix_inventory_reservations_inventory_id', table_name='inventory_reservations')
    op.drop_column('inventory_reservations', 'released_at')

    op.drop_column('inventory', 'updated_at')
    op.drop_column('inventory', 'created_at')
    op.drop_column('inventory', 'version')
    op.drop_column('inventory', 'reorder_point')
    op.drop_column('inventory', 'reserved_quantity')
    op.drop_column('inventory', 'stock_quantity')

    op.drop_index('ix_products_status', table_name='products')
    op.drop_index('ix_products_sku', table_name='products')
    op.drop_column('products', 'weight_grams')
    op.drop_column('products', 'specifications')
    op.drop_column('products', 'images')
    op.drop_column('products', 'is_featured')
    op.drop_column('products', 'status')
    op.drop_column('products', 'cost_price_paise')
    op.drop_column('products', 'compare_price_paise')
    op.drop_column('products', 'price_paise')
    op.drop_column('products', 'sku')

    op.drop_column('categories', 'updated_at')
    op.drop_column('categories', 'created_at')
    op.drop_column('categories', 'position')
    op.drop_column('categories', 'is_active')
    op.drop_column('categories', 'image_url')
    op.drop_column('categories', 'description')
