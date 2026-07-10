import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.ledger_entry import LedgerCategory


class LedgerEntryCreateRequest(BaseModel):
    field_id: uuid.UUID
    title: str
    detail: str
    category: LedgerCategory


class LedgerEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_id: uuid.UUID
    title: str
    detail: str
    category: LedgerCategory
    timestamp: datetime


class FieldReportSummary(BaseModel):
    name: str
    crop: Optional[str]
    area_hectares: Optional[float]
    ndvi_mean: Optional[float]
    health_score: Optional[int]


class ReportResponse(BaseModel):
    total_hectares: float
    field_count: int
    avg_health_score: int
    urea_bags: int
    dap_bags: int
    sop_bags: int
    ledger_entry_count: int
    field_summaries: list[FieldReportSummary]
    generated_at: datetime
