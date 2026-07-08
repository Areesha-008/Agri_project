"""
Alembic migration environment.

Key differences from the Alembic-generated default:
1. `sqlalchemy.url` comes from `app.core.config.settings.DATABASE_URL`
   instead of alembic.ini, so the DB connection string has one source of
   truth (the .env file), not two.
2. `target_metadata` points at our `Base.metadata`, which has all three
   tables (users, fields, ndvi_history) registered because
   `app.models.__init__` imports every model.
3. `include_object` filters out PostGIS's own internal table
   (spatial_ref_sys) so autogenerate doesn't try to "manage" a table it
   didn't create and shouldn't touch.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.base import Base

# Import every model so they're registered on Base.metadata before Alembic
# inspects it for autogenerate.
import app.models  # noqa: F401

config = context.config

# Inject the real DB URL from our app settings instead of alembic.ini.
config.set_main_option("sqlalchemy.url", str(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Exclude PostGIS's own system table from autogenerate diffs."""
    if type_ == "table" and name == "spatial_ref_sys":
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()