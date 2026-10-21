"""Plan blocks can carry a tag (area).

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-12

Additive only: one nullable column with a same-owner foreign key, so a block
can never point at another person's tag. Client privileges on plan_blocks
are table-level already (select/insert/update/delete on own rows).
"""
from alembic import op
from sqlalchemy import text

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

COLUMNS = [("plan_blocks", "area_id")]


def _preflight() -> None:
    bind = op.get_bind()
    for table, column in COLUMNS:
        if bind.execute(text(
            "select 1 from information_schema.columns "
            "where table_schema = 'public' and table_name = :t and column_name = :c"
        ), {"t": table, "c": column}).first():
            raise RuntimeError(f"Refusing to migrate: public.{table}.{column} already exists")


SCHEMA_SQL = r"""
alter table public.plan_blocks add column area_id uuid;
alter table public.plan_blocks add constraint plan_blocks_area_fk
  foreign key (user_id, area_id) references public.areas (user_id, id) on delete set null (area_id);
"""

DOWNGRADE_SQL = r"""
alter table public.plan_blocks drop constraint if exists plan_blocks_area_fk;
alter table public.plan_blocks drop column if exists area_id;
"""


def upgrade() -> None:
    _preflight()
    op.execute(SCHEMA_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
