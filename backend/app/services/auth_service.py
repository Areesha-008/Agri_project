import logging
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.exceptions.custom_exceptions import (
    InvalidCredentialsError,
    InvalidResetTokenError,
    UserAlreadyExistsError,
)
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin

logger = logging.getLogger("app")

# Gap 1 (GAPS.md) — "Try without an account" per the design's login screen.
# Real auth (JWT/bcrypt) stays as-is; this just auto-provisions one fixed
# demo user server-side so guests skip signup entirely, per the ground
# rules' dev-mode-session instruction. No password is usable for this
# account (random hash, never returned or checked outside login).
GUEST_USER_EMAIL = "guest@jadeedkashtkar.demo"


def get_or_create_guest_user(db: Session) -> User:
    user = db.query(User).filter(User.email == GUEST_USER_EMAIL).first()
    if user is None:
        user = User(email=GUEST_USER_EMAIL, hashed_password=hash_password(uuid.uuid4().hex))
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def register_user(db: Session, user_in: UserCreate) -> User:
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise UserAlreadyExistsError()

    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, credentials: UserLogin) -> User:
    user = db.query(User).filter(User.email == credentials.email).first()
    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_active:
        raise InvalidCredentialsError("This account has been deactivated")
    return user


def create_token_for_user(user: User) -> str:
    return create_access_token(subject=str(user.id))


def request_password_reset(db: Session, email: str) -> str | None:
    """
    Returns the reset link when settings.DEBUG is on (so the frontend can
    surface it directly — see EmailNotifier's stub-until-a-provider-exists
    precedent in services/notifications/notifier.py), else always None
    regardless of whether the email matched, so callers can't use response
    shape to enumerate registered accounts.
    """
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return None

    token = create_password_reset_token(str(user.id))
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    logger.info(f"[stub email notifier] password reset for {user.email}: {reset_link}")
    return reset_link if settings.DEBUG else None


def reset_password(db: Session, token: str, new_password: str) -> None:
    user_id = decode_password_reset_token(token)
    if user_id is None:
        raise InvalidResetTokenError()

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise InvalidResetTokenError()

    user.hashed_password = hash_password(new_password)
    db.commit()