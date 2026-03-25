"""Minimal UI shim that bridges old lib/ functions to step results.

Old ``lib/`` functions call ``ui.item()``, ``ui.print_msg()``, ``ui.confirm()``,
and ``ui.prompt()``.  This shim captures those calls as ``(name, status, detail)``
tuples that can be converted into :class:`StepResult` items.
"""

from __future__ import annotations


class UIShim:
    """Captures UI calls for later conversion to StepResult items."""

    def __init__(self) -> None:
        self.items: list[tuple[str, str, str]] = []

    def item(self, name: str, status: str, detail: str = "") -> None:
        self.items.append((name, status, detail))

    def print_msg(self, msg: str, status: str = "info") -> None:
        self.items.append((msg, status, ""))

    def confirm(self, msg: str) -> bool:
        return False  # non-interactive by default

    def prompt(self, msg: str, default: str = "") -> str:
        return default
