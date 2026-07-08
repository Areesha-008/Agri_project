from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.exceptions.custom_exceptions import InvalidCredentialsError, UserAlreadyExistsError
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin


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