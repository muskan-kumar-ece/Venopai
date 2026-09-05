"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-09-05 22:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Stub: Not verified, PostgreSQL unavailable.
    pass

def downgrade():
    # Stub: Not verified, PostgreSQL unavailable.
    pass
