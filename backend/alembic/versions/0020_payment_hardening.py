"""harden payment idempotency, checkout snapshots, and webhook durability

Revision ID: 0020_payment_hardening
Revises: 0019_shipment_tracking_and_webhook_inbox
Create Date: 2026-10-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0020_payment_hardening"
down_revision = "0019_shipment_tracking_and_webhook_inbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    checkout_columns = {column["name"] for column in inspector.get_columns("checkout_sessions")}
    if "items_snapshot" not in checkout_columns:
        op.add_column("checkout_sessions", sa.Column("items_snapshot", sa.Text(), nullable=True))

    payment_indexes = {index["name"] for index in inspector.get_indexes("payments")}
    pending_checkout = sa.text("checkout_session_id IS NOT NULL AND status = 'pending'")
    pending_quote = sa.text("quote_id IS NOT NULL AND status = 'pending'")
    terminal_checkout = sa.text(
        "checkout_session_id IS NOT NULL AND status IN ('successful', 'partially_refunded', 'refunded')"
    )
    terminal_quote = sa.text(
        "quote_id IS NOT NULL AND status IN ('successful', 'partially_refunded', 'refunded')"
    )

    if "uq_payments_pending_checkout_session" not in payment_indexes:
        op.create_index(
            "uq_payments_pending_checkout_session",
            "payments",
            ["checkout_session_id"],
            unique=True,
            postgresql_where=pending_checkout,
        )
    if "uq_payments_pending_quote" not in payment_indexes:
        op.create_index(
            "uq_payments_pending_quote",
            "payments",
            ["quote_id"],
            unique=True,
            postgresql_where=pending_quote,
        )
    if "uq_payments_terminal_checkout_session" not in payment_indexes:
        op.create_index(
            "uq_payments_terminal_checkout_session",
            "payments",
            ["checkout_session_id"],
            unique=True,
            postgresql_where=terminal_checkout,
        )
    if "uq_payments_terminal_quote" not in payment_indexes:
        op.create_index(
            "uq_payments_terminal_quote",
            "payments",
            ["quote_id"],
            unique=True,
            postgresql_where=terminal_quote,
        )

    webhook_columns = {column["name"] for column in inspector.get_columns("processed_webhook_events")}
    if "status" not in webhook_columns:
        op.add_column(
            "processed_webhook_events",
            sa.Column("status", sa.String(length=20), server_default="processed", nullable=False),
        )
    op.execute("UPDATE processed_webhook_events SET status = 'processed' WHERE status IS NULL")
    op.alter_column("processed_webhook_events", "status", server_default="pending")
    op.alter_column("processed_webhook_events", "processed_at", nullable=True)


def downgrade() -> None:
    op.drop_index("uq_payments_terminal_quote", table_name="payments")
    op.drop_index("uq_payments_terminal_checkout_session", table_name="payments")
    op.drop_index("uq_payments_pending_quote", table_name="payments")
    op.drop_index("uq_payments_pending_checkout_session", table_name="payments")
    op.drop_column("processed_webhook_events", "status")
    op.drop_column("checkout_sessions", "items_snapshot")
