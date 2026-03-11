from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models.

    IMPORTANT: This base is used ONLY as a read/write mapping layer.
    Schema migrations are managed exclusively by TypeORM in the gate application.
    Never call Base.metadata.create_all() in production.
    """
