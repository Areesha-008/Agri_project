import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.ndvi_job import NdviJobStatus


class NdviJobStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_id: uuid.UUID
    status: NdviJobStatus
    error_message: Optional[str] = None
    ndvi_history_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
