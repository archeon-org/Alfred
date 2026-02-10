"""
Optimized Entity and Relationship Types for Graphiti Knowledge Graph

Streamlined to 18 entity types and 18 relationship types.
Focused on cost efficiency while maintaining essential semantic relationships.

Reduced from 27 + 33 to minimize token usage in LLM prompts.
Each type reduction saves ~120 tokens per extraction call.
"""

from __future__ import annotations

from pydantic import BaseModel


# =============================================================================
# CORE ENTITY TYPES (18 essential types)
# =============================================================================


# People & Organizations
class Person(BaseModel):
    """Any individual - name, contact, author, family member, professional, patient."""

    pass


class Organization(BaseModel):
    """Any company, institution, group, or team - business, hospital, school, department."""

    pass


# Places
class Location(BaseModel):
    """Any place - address, city, country, building, venue, region, office."""

    pass


# Documents & Content
class Document(BaseModel):
    """Any document - contract, invoice, certificate, report, email, prescription, file."""

    pass


# Time & Events
class Event(BaseModel):
    """Time-bound occurrence - meeting, appointment, deadline, transaction, trip."""

    pass


class Date(BaseModel):
    """Specific date or time period - deadline, appointment date, contract period."""

    pass


# Products & Services
class Product(BaseModel):
    """Physical products or services - equipment, devices, goods, software, consulting."""

    pass


# Financial
class Monetary(BaseModel):
    """Financial amounts - price, salary, payment, fee, tax, budget."""

    pass


class Account(BaseModel):
    """Any account - bank account, user account, policy number, membership, insurance."""

    pass


# Work & Projects
class Project(BaseModel):
    """Work or initiative - business project, research, campaign, development, task."""

    pass


# Medical & Health
class Condition(BaseModel):
    """Medical condition - diagnosis, symptom, illness, injury, treatment."""

    pass


class Medication(BaseModel):
    """Medicines and pharmaceuticals - drugs, prescriptions, supplements."""

    pass


# Technology & Skills
class Concept(BaseModel):
    """Abstract idea - skill, technology, methodology, topic, field of study."""

    pass


class Software(BaseModel):
    """Software and applications - tools, platforms, systems, apps, technology."""

    pass


# Identification
class Identifier(BaseModel):
    """Reference numbers - ID, account number, case number, tracking number, license."""

    pass


class Contact(BaseModel):
    """Contact information - phone, email, website, social media handle."""

    pass


# Education & Credentials
class Education(BaseModel):
    """Educational background - degree, certification, course, training, qualification."""

    pass


# Role & Position
class Role(BaseModel):
    """Professional role or position - job title, responsibility, function."""

    pass


# =============================================================================
# RELATIONSHIP TYPES (18 essential types)
# =============================================================================


# Employment & Work
class WORKS_FOR(BaseModel):
    """Person works for or is employed by Organization."""

    pass


class MANAGES(BaseModel):
    """Person manages Project, Organization, or other Person."""

    pass


# Location
class LOCATED_IN(BaseModel):
    """Entity is physically located in or based in Location."""

    pass


# Ownership & Possession
class OWNS(BaseModel):
    """Person or Organization owns something."""

    pass


class HAS(BaseModel):
    """Entity has, possesses, or contains another entity."""

    pass


# Communication & Documents
class HAS_CONTACT(BaseModel):
    """Entity has contact information."""

    pass


class CREATED_BY(BaseModel):
    """Document or entity created, issued, or signed by Person or Organization."""

    pass


class REFERS_TO(BaseModel):
    """Entity refers to or mentions another entity."""

    pass


# Financial
class PAID(BaseModel):
    """Financial transaction - payment made by or to entity."""

    pass


class COSTS(BaseModel):
    """Entity has or costs a Monetary amount."""

    pass


# Structure & Hierarchy
class PART_OF(BaseModel):
    """Entity is part of, member of, or belongs to another entity."""

    pass


# Events & Time
class PARTICIPATED_IN(BaseModel):
    """Person participated in or attended Event or Project."""

    pass


class SCHEDULED_FOR(BaseModel):
    """Event scheduled for or occurred on specific Date."""

    pass


# Products & Services
class USES(BaseModel):
    """Entity uses, provides, or supplies Product, Service, or Software."""

    pass


# Medical
class DIAGNOSED_WITH(BaseModel):
    """Person diagnosed with or treated for Condition."""

    pass


class PRESCRIBED(BaseModel):
    """Medication prescribed for or used to treat Person or Condition."""

    pass


# Education & Skills
class HAS_SKILL(BaseModel):
    """Person has skill, expertise, or knowledge in Concept or Software."""

    pass


class HAS_EDUCATION(BaseModel):
    """Person has education, degree, or certification from Organization."""

    pass


# =============================================================================
# TYPE DICTIONARIES AND MAPPINGS
# =============================================================================

ENTITY_TYPES = {
    "Person": Person,
    "Organization": Organization,
    "Location": Location,
    "Document": Document,
    "Event": Event,
    "Date": Date,
    "Product": Product,
    "Monetary": Monetary,
    "Account": Account,
    "Project": Project,
    "Condition": Condition,
    "Medication": Medication,
    "Concept": Concept,
    "Software": Software,
    "Identifier": Identifier,
    "Contact": Contact,
    "Education": Education,
    "Role": Role,
}

EDGE_TYPES = {
    "WORKS_FOR": WORKS_FOR,
    "MANAGES": MANAGES,
    "LOCATED_IN": LOCATED_IN,
    "OWNS": OWNS,
    "HAS": HAS,
    "HAS_CONTACT": HAS_CONTACT,
    "CREATED_BY": CREATED_BY,
    "REFERS_TO": REFERS_TO,
    "PAID": PAID,
    "COSTS": COSTS,
    "PART_OF": PART_OF,
    "PARTICIPATED_IN": PARTICIPATED_IN,
    "SCHEDULED_FOR": SCHEDULED_FOR,
    "USES": USES,
    "DIAGNOSED_WITH": DIAGNOSED_WITH,
    "PRESCRIBED": PRESCRIBED,
    "HAS_SKILL": HAS_SKILL,
    "HAS_EDUCATION": HAS_EDUCATION,
}

# Edge type mappings: (source_entity_type, target_entity_type) -> [allowed_edge_types]
# Simplified to support the reduced 18 edge types
EDGE_TYPE_MAP = {
    # Person relationships
    ("Person", "Organization"): ["WORKS_FOR", "PART_OF", "MANAGES"],
    ("Person", "Location"): ["LOCATED_IN"],
    ("Person", "Event"): ["PARTICIPATED_IN"],
    ("Person", "Project"): ["MANAGES", "PARTICIPATED_IN", "PART_OF"],
    ("Person", "Account"): ["HAS", "OWNS"],
    ("Person", "Contact"): ["HAS_CONTACT"],
    ("Person", "Condition"): ["DIAGNOSED_WITH"],
    ("Person", "Medication"): ["PRESCRIBED"],
    ("Person", "Product"): ["OWNS", "USES"],
    ("Person", "Document"): ["CREATED_BY", "OWNS"],
    ("Person", "Person"): ["MANAGES"],
    ("Person", "Concept"): ["HAS_SKILL"],
    ("Person", "Software"): ["HAS_SKILL", "USES"],
    ("Person", "Education"): ["HAS_EDUCATION"],
    ("Person", "Role"): ["HAS"],
    # Organization relationships
    ("Organization", "Location"): ["LOCATED_IN"],
    ("Organization", "Person"): ["WORKS_FOR"],
    ("Organization", "Product"): ["USES", "OWNS"],
    ("Organization", "Document"): ["CREATED_BY", "HAS"],
    ("Organization", "Account"): ["HAS", "OWNS"],
    ("Organization", "Organization"): ["PART_OF", "OWNS"],
    ("Organization", "Education"): ["HAS_EDUCATION"],
    # Document relationships
    ("Document", "Person"): ["CREATED_BY"],
    ("Document", "Organization"): ["CREATED_BY"],
    ("Document", "Document"): ["REFERS_TO"],
    ("Document", "Date"): ["SCHEDULED_FOR"],
    ("Document", "Monetary"): ["COSTS"],
    # Event relationships
    ("Event", "Location"): ["LOCATED_IN"],
    ("Event", "Date"): ["SCHEDULED_FOR"],
    ("Event", "Person"): ["PARTICIPATED_IN"],
    # Financial relationships
    ("Monetary", "Person"): ["PAID"],
    ("Monetary", "Organization"): ["PAID"],
    ("Account", "Person"): ["PART_OF", "OWNS"],
    ("Account", "Organization"): ["PART_OF"],
    # Project & Work
    ("Project", "Person"): ["MANAGES", "PARTICIPATED_IN"],
    ("Project", "Organization"): ["PART_OF"],
    # Medical
    ("Condition", "Person"): ["DIAGNOSED_WITH"],
    ("Medication", "Person"): ["PRESCRIBED"],
    ("Medication", "Condition"): ["USES"],
    # Products & Services
    ("Product", "Organization"): ["USES"],
    ("Product", "Monetary"): ["COSTS"],
    ("Software", "Organization"): ["USES"],
    ("Software", "Person"): ["HAS_SKILL"],
    # Universal fallback
    ("Entity", "Entity"): list(EDGE_TYPES.keys()),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_entity_types() -> dict[str, type[BaseModel]]:
    """Get the dictionary of all entity types."""
    return ENTITY_TYPES


def get_edge_types() -> dict[str, type[BaseModel]]:
    """Get the dictionary of all edge types."""
    return EDGE_TYPES


def get_edge_type_map() -> dict[tuple[str, str], list[str]]:
    """Get the edge type mapping."""
    return EDGE_TYPE_MAP
