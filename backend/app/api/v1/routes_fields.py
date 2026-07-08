import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.field import FieldListItem, FieldResponse, FieldSaveRequest
from app.services.field_service import (
    field_to_response,
    get_field_or_404,
    list_fields_for_user,
    save_field,
)

router = APIRouter(prefix="/fields", tags=["Fields"])


@router.post("/save", response_model=FieldResponse, status_code=201)
def save_field_endpoint(
    field_in: FieldSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Protected endpoint — requires a valid JWT (Authorization: Bearer <token>).

    Expects the same geometry and NDVI stats the user already saw from
    POST /ndvi/analyze — NDVI is not recomputed here, just persisted.
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