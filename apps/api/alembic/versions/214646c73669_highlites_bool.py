from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '214646c73669'
down_revision: Union[str, Sequence[str], None] = '625b39c8b293'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.alter_column('product', 'highlights',
        existing_type=sa.String(),  # ou o tipo atual que estava antes
        type_=sa.Boolean(),
        existing_nullable=True,
        postgresql_using='highlights::boolean'  # ← isso aqui resolve
    )

def downgrade():
    op.alter_column('product', 'highlights',
        existing_type=sa.Boolean(),
        type_=sa.String(),  # volta pro tipo original
        existing_nullable=True,
        postgresql_using='highlights::text'
    )
