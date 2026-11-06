# Import every model module here; Alembic's autogenerate only sees tables imported this way.
from app.models.event import Event
from app.models.role import Role
from app.models.signup import Signup
from app.models.user import User

__all__ = ["Event", "Role", "Signup", "User"]
