# Import every model module here; Alembic's autogenerate only sees tables imported this way.
from app.models.delivery import Delivery
from app.models.draft import MessageDraft
from app.models.event import Event
from app.models.form_link import FormLink
from app.models.inbound import InboundReply, ProviderEvent
from app.models.participation import Participation
from app.models.role import Role
from app.models.signup import Signup
from app.models.user import User

__all__ = [
    "Delivery",
    "Event",
    "FormLink",
    "InboundReply",
    "MessageDraft",
    "Participation",
    "ProviderEvent",
    "Role",
    "Signup",
    "User",
]
