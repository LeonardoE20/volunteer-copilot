"""Normalize phone numbers and Apple ID emails at the provider boundary."""

import re

_DIGITS = re.compile(r"\D")


def normalize_phone(value: str) -> str:
    """Return E.164 for a phone number, or a lowercased Apple ID email.

    A 10-digit number is treated as a US number. Chert already sends handles in a
    stable form; this makes coordinator input match those handles.
    """
    raw = value.strip()
    if "@" in raw:
        local, _, domain = raw.partition("@")
        if not local or "." not in domain:
            raise ValueError("Enter a phone number or Apple ID email")
        return raw.casefold()
    digits = _DIGITS.sub("", raw)
    if raw.startswith("+"):
        if not 8 <= len(digits) <= 15:
            raise ValueError("Enter a phone number with a country code")
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    raise ValueError("Enter a phone number with a country code")
