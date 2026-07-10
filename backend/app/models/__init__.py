"""
Importing every model here ensures they're all registered on
`Base.metadata` before Alembic (or `Base.metadata.create_all`) inspects it.
Without this, Alembic's autogenerate can silently miss tables that were
never imported anywhere in the app's import chain.
"""

from app.models.user import User  # noqa: F401
from app.models.field import Field  # noqa: F401
from app.models.ndvi_history import NdviHistory  # noqa: F401
from app.models.ndvi_job import NdviJob  # noqa: F401
from app.models.user_settings import UserSettings  # noqa: F401
from app.models.district_yield_baseline import DistrictYieldBaseline  # noqa: F401
from app.models.mandi_rate import MandiRate  # noqa: F401
from app.models.alert import Alert  # noqa: F401
from app.models.ledger_entry import LedgerEntry  # noqa: F401
from app.models.scan import Scan  # noqa: F401