"""VenopAI Admin Bootstrap & Management CLI.
Allows operations engineers to provision the root SUPER_ADMIN or staff members safely.
Usage:
    python -m app.cli.create_admin --email admin@venopai.com --name "Root Admin" --password "SecretPassword123!" --role SUPER_ADMIN
Or interactive:
    python -m app.cli.create_admin
"""
import sys
import argparse
import getpass
from datetime import datetime, timezone
from sqlalchemy import func

from app.db.session import SessionLocal
from app.models.user import User, AuditEvent
from app.core.security import get_password_hash, validate_password_strength, generate_secure_password
from app.api.deps import CANONICAL_ADMIN_ROLES


def create_or_update_admin(email: str, full_name: str, password: str, role: str = "SUPER_ADMIN") -> None:
    email_norm = email.strip().lower()
    role_norm = role.strip()

    if role_norm not in CANONICAL_ADMIN_ROLES:
        print(f"❌ Error: Invalid role '{role_norm}'. Allowed roles: {', '.join(CANONICAL_ADMIN_ROLES)}")
        sys.exit(1)

    is_valid, msg = validate_password_strength(password)
    if not is_valid:
        print(f"❌ Password error: {msg}")
        sys.exit(1)

    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == email_norm).first()
        is_super = (role_norm == "SUPER_ADMIN")

        if user:
            print(f"ℹ️ User with email '{email_norm}' already exists (ID: {user.id}, Role: {user.role}, Status: {user.status}).")
            confirm = input("Do you want to update this user's password and set role to '{}'? [y/N]: ".format(role_norm)).strip().lower()
            if confirm != "y":
                print("Aborted.")
                return

            user.hashed_password = get_password_hash(password)
            user.role = role_norm
            user.is_superuser = is_super
            user.status = "verified"
            user.is_active = True
            if full_name:
                user.full_name = full_name.strip()
            user.updated_at = datetime.now(timezone.utc)

            audit = AuditEvent(
                user_id=user.id,
                action="admin.cli_updated",
                entity_type="User",
                entity_id=user.id,
                details={
                    "email": email_norm,
                    "role": role_norm,
                    "is_superuser": is_super,
                    "source": "cli",
                },
            )
            db.add(audit)
            db.commit()
            print(f"✅ Successfully updated user {email_norm} to role '{role_norm}'.")
        else:
            hashed_pwd = get_password_hash(password)
            new_user = User(
                email=email_norm,
                full_name=full_name.strip() if full_name else "Administrator",
                hashed_password=hashed_pwd,
                role=role_norm,
                status="verified",
                is_active=True,
                is_superuser=is_super,
            )
            db.add(new_user)
            db.flush()

            audit = AuditEvent(
                user_id=new_user.id,
                action="admin.cli_bootstrap",
                entity_type="User",
                entity_id=new_user.id,
                details={
                    "email": email_norm,
                    "role": role_norm,
                    "is_superuser": is_super,
                    "source": "cli",
                },
            )
            db.add(audit)
            db.commit()
            print(f"✅ Successfully provisioned new administrator!")
            print(f"   ID:       {new_user.id}")
            print(f"   Email:    {new_user.email}")
            print(f"   Name:     {new_user.full_name}")
            print(f"   Role:     {new_user.role}")
            print(f"   Status:   {new_user.status}")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Provision or update a VenopAI administrator.")
    parser.add_argument("--email", "-e", help="Administrator email address")
    parser.add_argument("--name", "-n", help="Full name of the administrator")
    parser.add_argument("--password", "-p", help="Administrator password (if omitted, will prompt)")
    parser.add_argument("--role", "-r", default="SUPER_ADMIN", choices=CANONICAL_ADMIN_ROLES, help="Role to assign")
    parser.add_argument("--auto-password", action="store_true", help="Auto-generate a secure temporary password")

    args = parser.parse_args()

    email = args.email
    if not email:
        email = input("Enter admin email: ").strip()
        if not email:
            print("❌ Email is required.")
            sys.exit(1)

    name = args.name
    if not name and not sys.stdin.isatty():
        name = "Administrator"
    elif not name:
        name = input("Enter full name [Administrator]: ").strip() or "Administrator"

    if args.auto_password:
        password = generate_secure_password()
        print(f"🔑 Auto-generated password: {password}")
    elif args.password:
        password = args.password
    else:
        password = getpass.getpass("Enter password (min 10 chars, upper, lower, digit, symbol): ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords do not match.")
            sys.exit(1)

    create_or_update_admin(email=email, full_name=name, password=password, role=args.role)


if __name__ == "__main__":
    main()
