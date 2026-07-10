from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_token_for_user,
    get_or_create_guest_user,
    register_user,
    request_password_reset,
    reset_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=UserResponse, status_code=201)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    user = register_user(db, user_in)
    return user


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, credentials)
    access_token = create_token_for_user(user)
    return Token(access_token=access_token)


@router.post("/guest", response_model=Token)
def guest_login(db: Session = Depends(get_db)):
    """
    "Try without an account" — see design_handoff README, Auth section, and
    GAPS.md Gap 1. Auto-registers/logs-in one fixed demo user server-side and
    returns a real access token, same shape as POST /auth/login, so the
    frontend's AuthProvider treats it identically.
    """
    user = get_or_create_guest_user(db)
    access_token = create_token_for_user(user)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Always returns the same message regardless of whether the email is
    registered, so the response can't be used to enumerate accounts.
    """
    dev_reset_url = request_password_reset(db, body.email)
    return MessageResponse(
        message="If that email is registered, a password reset link has been sent.",
        dev_reset_url=dev_reset_url,
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password_endpoint(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_password(db, body.token, body.new_password)
    return MessageResponse(message="Password updated — you can now sign in.")