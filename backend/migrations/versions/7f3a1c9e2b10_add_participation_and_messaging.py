"""add participation and messaging

Revision ID: 7f3a1c9e2b10
Revises: 2bca5314880f
Create Date: 2026-11-06 13:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7f3a1c9e2b10"
down_revision: str | Sequence[str] | None = "2bca5314880f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("timezone", sa.String(), server_default="America/Los_Angeles", nullable=False),
    )
    op.add_column(
        "events", sa.Column("status", sa.String(), server_default="published", nullable=False)
    )
    op.add_column("events", sa.Column("event_type", sa.String(), nullable=True))
    op.create_check_constraint(
        "ck_events_status_known",
        "events",
        "status in ('draft', 'published', 'completed', 'cancelled')",
    )
    op.alter_column("users", "email", existing_type=sa.String(), nullable=True)
    op.add_column(
        "users", sa.Column("text_opt_in", sa.Boolean(), server_default=sa.true(), nullable=False)
    )
    op.add_column(
        "users",
        sa.Column(
            "role_preferences",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.create_index("uq_users_phone", "users", ["phone"], unique=True)
    op.create_table(
        "participations",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("pool", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("availability", postgresql.JSONB(), nullable=True),
        sa.Column("uniform_notes", sa.String(), nullable=True),
        sa.Column(
            "preferred_shift_ids",
            postgresql.ARRAY(sa.Uuid()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "confirmed_shift_ids",
            postgresql.ARRAY(sa.Uuid()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("pool in ('primary', 'standby')", name="ck_participations_pool_known"),
        sa.CheckConstraint(
            "status in ('not_invited', 'invited', 'interested', 'details_submitted', "
            "'confirmed', 'declined', 'cancelled')",
            name="ck_participations_status_known",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "user_id", name="uq_participations_event_user"),
    )
    op.create_index("ix_participations_event_id", "participations", ["event_id"])
    op.create_index("ix_participations_user_id", "participations", ["user_id"])
    op.create_table(
        "message_drafts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("audience", sa.String(), server_default="individual", nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("participant_ids", postgresql.ARRAY(sa.Uuid()), nullable=False),
        sa.Column(
            "resource_links", postgresql.ARRAY(sa.String()), server_default="{}", nullable=False
        ),
        sa.Column("send_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("relative_offset", sa.String(), nullable=True),
        sa.Column("minutes_before", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), server_default="draft", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose in ('interest', 'form_link', 'policies', 'uniform', 'parking', "
            "'reminder', 'standby')",
            name="ck_message_drafts_purpose_known",
        ),
        sa.CheckConstraint(
            "audience in ('individual', 'group')", name="ck_message_drafts_audience_known"
        ),
        sa.CheckConstraint(
            "status in ('draft', 'scheduled', 'accepted', 'needs_review')",
            name="ck_message_drafts_status_known",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_message_drafts_event_id", "message_drafts", ["event_id"])
    op.create_table(
        "form_links",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("participation_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participation_id"], ["participations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("participation_id"),
    )
    op.create_index("ix_form_links_event_id", "form_links", ["event_id"])
    op.create_table(
        "deliveries",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=True),
        sa.Column("participation_id", sa.Uuid(), nullable=True),
        sa.Column("draft_id", sa.Uuid(), nullable=True),
        sa.Column("provider_message_id", sa.String(), nullable=True),
        sa.Column("provider_chat_id", sa.String(), nullable=True),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("retryable", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "state in ('queued', 'sent', 'delivered', 'failed', 'unknown')",
            name="ck_deliveries_state_known",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participation_id"], ["participations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["draft_id"], ["message_drafts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_deliveries_participation_id", "deliveries", ["participation_id"])
    op.create_index("ix_deliveries_draft_id", "deliveries", ["draft_id"])
    op.create_index("ix_deliveries_provider_message_id", "deliveries", ["provider_message_id"])
    op.create_table(
        "inbound_replies",
        sa.Column("provider_event_id", sa.String(), nullable=False),
        sa.Column("sender", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("resolution", sa.String(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("participation_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["participation_id"], ["participations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("provider_event_id"),
    )
    op.create_table(
        "provider_events",
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id"),
    )
    for table in (
        "participations",
        "message_drafts",
        "form_links",
        "deliveries",
        "inbound_replies",
        "provider_events",
    ):
        op.execute(f'alter table "{table}" enable row level security')


def downgrade() -> None:
    op.drop_table("provider_events")
    op.drop_table("inbound_replies")
    op.drop_index("ix_deliveries_provider_message_id", table_name="deliveries")
    op.drop_index("ix_deliveries_draft_id", table_name="deliveries")
    op.drop_index("ix_deliveries_participation_id", table_name="deliveries")
    op.drop_table("deliveries")
    op.drop_index("ix_form_links_event_id", table_name="form_links")
    op.drop_table("form_links")
    op.drop_index("ix_message_drafts_event_id", table_name="message_drafts")
    op.drop_table("message_drafts")
    op.drop_index("ix_participations_user_id", table_name="participations")
    op.drop_index("ix_participations_event_id", table_name="participations")
    op.drop_table("participations")
    op.drop_index("uq_users_phone", table_name="users")
    op.drop_column("users", "role_preferences")
    op.drop_column("users", "text_opt_in")
    op.alter_column("users", "email", existing_type=sa.String(), nullable=False)
    op.drop_constraint("ck_events_status_known", "events", type_="check")
    op.drop_column("events", "event_type")
    op.drop_column("events", "status")
    op.drop_column("events", "timezone")
