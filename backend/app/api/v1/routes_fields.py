import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.field import (
    FieldCreateRequest,
    FieldCreateResponse,
    FieldListItem,
    FieldNdviLatestResponse,
    FieldResponse,
    FieldSaveRequest,
)
from app.schemas.ndvi_job import NdviJobStatusResponse
from app.services.field_service import (
    delete_field,
    field_to_response,
    get_field_or_404,
    list_fields_for_user,
    save_field,
)
from app.services.ndvi_job_service import (
    create_field_with_job,
    get_field_ndvi,
    get_job_or_404,
    run_ndvi_job,
)

router = APIRouter(prefix="/fields", tags=["Fields"])


@router.post("", response_model=FieldCreateResponse, status_code=201)
def create_field(
    field_in: FieldCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves the field boundary, then schedules a background NDVI/NDMI
    analysis job (see ndvi_job_service.run_ndvi_job). Poll
    GET /fields/{field_id}/jobs/{job_id} for status, then
    GET /fields/{field_id}/ndvi once status is "done".
    """
    field, job = create_field_with_job(db, current_user.id, field_in)
    background_tasks.add_task(run_ndvi_job, job.id)
    return FieldCreateResponse(field=field_to_response(field), job_id=job.id)


@router.post("/save", response_model=FieldResponse, status_code=201, deprecated=True)
def save_field_endpoint(
    field_in: FieldSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deprecated — use POST /fields instead, which triggers real server-side
    NDVI/NDMI analysis rather than trusting frontend-computed stats. Kept
    mounted for one release so in-flight callers don't break.
    """
    field = save_field(db, current_user.id, field_in)
    return field_to_response(field)


@router.get("", response_model=list[FieldListItem])
def list_fields(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_fields_for_user(db, current_user.id)


@router.get("/{field_id}", response_model=FieldResponse)
def get_field(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    field = get_field_or_404(db, current_user.id, field_id)
    return field_to_response(field)


@router.delete("/{field_id}", status_code=204)
def delete_field_endpoint(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_field(db, current_user.id, field_id)


@router.get("/{field_id}/jobs/{job_id}", response_model=NdviJobStatusResponse)
def get_field_job(
    field_id: uuid.UUID,
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ensure the field belongs to the caller before revealing job status.
    get_field_or_404(db, current_user.id, field_id)
    return get_job_or_404(db, job_id)


@router.get("/{field_id}/ndvi", response_model=FieldNdviLatestResponse)
def get_field_ndvi_endpoint(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_field_ndvi(db, current_user.id, field_id)