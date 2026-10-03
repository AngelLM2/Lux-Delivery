from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c31e9a4f2f8b"
down_revision: Union[str, Sequence[str], None] = "a2988fe0d154"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("product", sa.Column("image_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("product", "image_url")
