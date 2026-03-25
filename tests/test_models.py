"""Tests for copilot_setup.models — dataclass construction and behavior."""

from __future__ import annotations

from copilot_setup.models import ItemResult, StepResult, Summary


class TestItemResult:
    def test_basic_construction(self):
        item = ItemResult("foo", "created", "linked")
        assert item.name == "foo"
        assert item.status == "created"
        assert item.detail == "linked"

    def test_default_detail(self):
        item = ItemResult("bar", "exists")
        assert item.detail == ""


class TestStepResult:
    def test_empty(self):
        result = StepResult()
        assert result.status == "ok"
        assert result.items == []
        assert not result.has_failures

    def test_item_builder(self):
        result = StepResult()
        result.item("a", "created", "done")
        result.item("b", "failed", "error")
        assert len(result.items) == 2
        assert result.has_failures

    def test_created_and_failed_filters(self):
        result = StepResult()
        result.item("a", "created")
        result.item("b", "exists")
        result.item("c", "failed")
        assert len(result.created) == 1
        assert len(result.failed) == 1

    def test_no_failures(self):
        result = StepResult()
        result.item("a", "exists")
        result.item("b", "skipped")
        assert not result.has_failures


class TestSummary:
    def test_record_and_query(self):
        summary = Summary()
        r1 = StepResult()
        r1.item("x", "created")
        r2 = StepResult()
        r2.item("y", "failed")

        summary.record("step1", r1)
        summary.record("step2", r2)

        assert len(summary.steps) == 2
        assert summary.has_failures
        assert len(summary.all_items) == 2

    def test_items_by_status(self):
        summary = Summary()
        r = StepResult()
        r.item("a", "created")
        r.item("b", "created")
        r.item("c", "failed")
        summary.record("test", r)

        assert len(summary.items_by_status("created")) == 2
        assert len(summary.items_by_status("failed")) == 1
        assert len(summary.items_by_status("skipped")) == 0

    def test_step_items(self):
        summary = Summary()
        r = StepResult()
        r.item("a", "success")
        summary.record("s1", r)

        assert len(summary.step_items("s1")) == 1
        assert summary.step_items("nonexistent") == []

    def test_no_failures_when_empty(self):
        summary = Summary()
        assert not summary.has_failures
