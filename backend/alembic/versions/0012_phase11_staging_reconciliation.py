"""phase 11: staging schema reconciliation (service requests project_id and address postal_code nullable)

Revision ID: 0012_phase11_staging_reconciliation
Revises: 0011_phase10_review_target
Create Date: 2026-09-06 22:30:00.000000

"""
from alembic import op, context
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0012_phase11_staging_reconciliation'
down_revision = '0011_phase10_review_target'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    # 1. Service requests project_id must be nullable
    service_tables = ['manufacturing_requests', 'consultation_requests', 'design_requests', 'software_requests']
    for tbl in service_tables:
        if tbl in tables:
            cols = [c['name'] for c in insp.get_columns(tbl)]
            if 'project_id' in cols:
                try:
                    op.alter_column(tbl, 'project_id', existing_type=sa.UUID(), nullable=True)
                except Exception:
                    pass

    # 2. Addresses postal_code must be nullable to support both pincode and legacy postal_code
    if 'addresses' in tables:
        addr_cols = [c['name'] for c in insp.get_columns('addresses')]
        if 'postal_code' in addr_cols:
            try:
                op.alter_column('addresses', 'postal_code', existing_type=sa.String(), nullable=True)
            except Exception:
                pass

def downgrade() -> None:
    pass
