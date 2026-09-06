from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserUpdateProfile, UserEmailChange, UserPasswordChange
from app.core.security import verify_password, get_password_hash
from fastapi import HTTPException

def update_user_profile(db: Session, user: User, data: UserUpdateProfile) -> User:
    if data.name is not None:
        user.full_name = data.name
    if data.phone is not None:
        user.phone = data.phone
    db.commit()
    db.refresh(user)
    return user

def change_user_email(db: Session, user: User, data: UserEmailChange) -> User:
    existing = db.query(User).filter(User.email == data.new_email).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user.email = data.new_email
    db.commit()
    db.refresh(user)
    return user

def change_user_password(db: Session, user: User, data: UserPasswordChange) -> User:
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    db.refresh(user)
    return user
