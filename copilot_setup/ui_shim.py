"""Minimal UI shim that bridges old lib/ functions to step results.

Old ``lib/`` functions call ``ui.item()``, ``ui.print_msg()``, ``ui.confirm()``,
and ``ui.prompt()``.  This shim captures those calls as ``(name, status, detail)``
tuples that can be converted into :class:`StepResult` items.

When a ``real_ui`` is provided, ``confirm()`` and ``prompt()`` delegate to it
so that interactive steps still work correctly.  Without ``real_ui``, they
return safe non-interactive defaults.
"""

from __future__ import annotations

from typing import Any


class UIShim:
    """Captures UI calls for later conversion to StepResult items.

    Args:
        real_ui: Optional real UI instance to delegate interactive calls to.
    """

    def __init__(self, real_ui: Any = None) -> None:
        self.items: list[tuple[str, str, str]] = []
        self._real_ui = real_ui

    def item(self, name: str, status: str, detail: str = "") -> None:
        self.items.append((name, status, detail))

    def print_msg(self, msg: str, status: str = "info") -> None:
        self.items.append((msg, status, ""))

    def confirm(self, msg: str) -> bool:
        if self._real_ui is not None:
            return self._real_ui.confirm(msg)
        return False

    def prompt(self, msg: str, default: str = "") -> str:
        if self._real_ui is not None:
            return self._real_ui.prompt(msg, default=default)
        return default
