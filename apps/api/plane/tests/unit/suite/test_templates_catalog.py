# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.suite.services.templates import TemplateError, validate_definition
from plane.suite.templates_catalog import (
    BUILTIN_TEMPLATES,
    get_builtin_template,
    list_builtin_templates,
    resolve_transitions,
)


@pytest.mark.unit
@pytest.mark.parametrize("template", BUILTIN_TEMPLATES, ids=lambda t: t["key"])
def test_builtin_template_is_consistent(template):
    validate_definition(template)
    state_names = {s["name"] for s in template["states"]}
    label_names = {lb["name"] for lb in template["labels"]}
    module_names = {m["name"] for m in template["modules"]}
    assert sum(1 for s in template["states"] if s.get("default")) == 1
    for item in template["work_items"]:
        assert item["state"] in state_names
        assert set(item["labels"]) <= label_names
        assert item["module"] is None or item["module"] in module_names
    for a, b in resolve_transitions(template):
        assert a in state_names and b in state_names and a != b


@pytest.mark.unit
def test_keys_unique_and_listing_light():
    keys = [t["key"] for t in BUILTIN_TEMPLATES]
    assert len(keys) == len(set(keys))
    listing = list_builtin_templates()
    assert all("work_items" not in t for t in listing)
    assert {t["industry"] for t in listing} >= {"Software", "Marketing", "Sales", "HR", "Construction", "Finance"}


@pytest.mark.unit
def test_get_builtin_returns_copy():
    first = get_builtin_template("agile-scrum")
    first["states"].clear()
    assert get_builtin_template("agile-scrum")["states"]
    assert get_builtin_template("missing") is None


@pytest.mark.unit
def test_linear_workflow_moves_one_step_and_allows_cancel():
    definition = {
        "workflow": "linear",
        "states": [
            {"name": "A", "group": "unstarted"},
            {"name": "B", "group": "started"},
            {"name": "C", "group": "completed"},
            {"name": "X", "group": "cancelled"},
        ],
    }
    pairs = set(resolve_transitions(definition))
    assert ("A", "B") in pairs and ("B", "A") in pairs and ("B", "C") in pairs
    assert ("A", "C") not in pairs
    assert {("A", "X"), ("B", "X"), ("C", "X"), ("X", "A")} <= pairs


@pytest.mark.unit
def test_open_workflow_has_no_transitions():
    assert resolve_transitions({"workflow": "open", "states": [{"name": "A", "group": "started"}]}) == []


@pytest.mark.unit
@pytest.mark.parametrize(
    "definition",
    [
        {"states": []},
        {"states": [{"name": "A", "group": "weird"}]},
        {"states": [{"name": "A", "group": "started"}, {"name": "A", "group": "started"}]},
        {"states": [{"name": "A", "group": "started"}], "work_items": [{"name": "x", "state": "Z"}]},
    ],
)
def test_invalid_definitions_rejected(definition):
    with pytest.raises(TemplateError):
        validate_definition(definition)
