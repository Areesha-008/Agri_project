from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.ledger import LedgerEntryCreateRequest, LedgerEntryResponse, ReportResponse
from app.services.ledger_service import build_report, create_ledger_entry, list_ledger_entries_for_user
from app.services.report_pdf import render_report_pdf

router = APIRouter(tags=["Ledger & Report"])


@router.post("/ledger", response_model=LedgerEntryResponse, status_code=201)
def post_ledger_entry(
    entry_in: LedgerEntryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_ledger_entry(db, current_user.id, entry_in)


@router.get("/ledger", response_model=list[LedgerEntryResponse])
def get_ledger_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_ledger_entries_for_user(db, current_user.id)


@router.get("/report", response_model=ReportResponse)
def get_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_report(db, current_user.id)


@router.get("/report/pdf")
def get_report_pdf(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = build_report(db, current_user.id)
    pdf_bytes = render_report_pdf(report, current_user.email)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=production-report.pdf"},
    )
