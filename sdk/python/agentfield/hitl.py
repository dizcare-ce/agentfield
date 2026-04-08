"""Native HITL form builder helpers for AgentField.

Use these helpers to construct typed form schemas for the built-in HITL portal.
The resulting dict can be passed directly to ``app.pause(form_schema=...)``.

Example::

    from agentfield import hitl

    schema = hitl.Form(
        title="Review PR #1138",
        description="Please review the following change.",
        tags=["pr-review"],
        fields=[
            hitl.Markdown("### Diff\\n```go\\n- old line\\n+ new line\\n```"),
            hitl.ButtonGroup(
                "decision",
                options=[
                    hitl.Option("approve", "Approve", variant="default"),
                    hitl.Option("reject", "Reject", variant="destructive"),
                ],
                required=True,
            ),
            hitl.Textarea("comments", label="Comments", placeholder="Optional..."),
        ],
    ).to_dict()

    result = await app.pause(form_schema=schema)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional


# ---------------------------------------------------------------------------
# Option
# ---------------------------------------------------------------------------


@dataclass
class Option:
    """A selectable option used in select, radio, multiselect, and button_group fields.

    Args:
        value: The machine-readable value submitted with the form.
        label: The human-readable label shown in the UI.
        variant: Optional button style for ``ButtonGroup`` fields.
            One of ``"default"``, ``"secondary"``, ``"destructive"``,
            ``"outline"``, or ``"ghost"``.
    """

    value: str
    label: str
    variant: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"value": self.value, "label": self.label}
        if self.variant is not None:
            d["variant"] = self.variant
        return d


# ---------------------------------------------------------------------------
# HiddenWhen
# ---------------------------------------------------------------------------


@dataclass
class HiddenWhen:
    """Conditional visibility rule for a form field.

    Exactly one condition key should be set.  When the condition is satisfied,
    the field is hidden and its value is removed from the submitted response.

    Args:
        field: Name of the sibling field to watch.
        equals: Hide when the watched field equals this value.
        not_equals: Hide when the watched field does not equal this value.
        in_: Hide when the watched field's value is in this list.
            Serialised as ``"in"`` in the JSON schema.
        not_in: Hide when the watched field's value is not in this list.
    """

    field: str
    equals: Any = None
    not_equals: Any = None
    in_: Optional[List[Any]] = None
    not_in: Optional[List[Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"field": self.field}
        if self.equals is not None:
            d["equals"] = self.equals
        if self.not_equals is not None:
            d["notEquals"] = self.not_equals
        if self.in_ is not None:
            d["in"] = self.in_
        if self.not_in is not None:
            d["notIn"] = self.not_in
        return d


# ---------------------------------------------------------------------------
# Base Field
# ---------------------------------------------------------------------------


class Field:
    """Abstract base class for all HITL form fields.

    Subclasses must set ``_type`` and implement ``to_dict()``.
    """

    _type: str = ""

    def to_dict(self) -> Dict[str, Any]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Concrete field types
# ---------------------------------------------------------------------------


@dataclass
class Markdown(Field):
    """A read-only markdown block rendered with react-markdown.

    Args:
        content: Markdown string to render.
    """

    content: str
    _type: str = field(default="markdown", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        return {"type": "markdown", "content": self.content}


@dataclass
class Text(Field):
    """A single-line text input.

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text shown below the input.
        required: Whether the field is required.
        default: Default value pre-filled in the input.
        disabled: Whether the field is disabled.
        placeholder: Placeholder text.
        max_length: Maximum character length.
        pattern: Regex pattern for validation.
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[str] = None
    disabled: bool = False
    placeholder: Optional[str] = None
    max_length: Optional[int] = None
    pattern: Optional[str] = None
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="text", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "text", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.placeholder is not None:
            d["placeholder"] = self.placeholder
        if self.max_length is not None:
            d["max_length"] = self.max_length
        if self.pattern is not None:
            d["pattern"] = self.pattern
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Textarea(Field):
    """A multi-line text area.

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default value.
        disabled: Whether the field is disabled.
        placeholder: Placeholder text.
        rows: Number of visible text rows (hint).
        max_length: Maximum character length.
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[str] = None
    disabled: bool = False
    placeholder: Optional[str] = None
    rows: Optional[int] = None
    max_length: Optional[int] = None
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="textarea", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "textarea", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.placeholder is not None:
            d["placeholder"] = self.placeholder
        if self.rows is not None:
            d["rows"] = self.rows
        if self.max_length is not None:
            d["max_length"] = self.max_length
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Number(Field):
    """A numeric input.

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default numeric value.
        disabled: Whether the field is disabled.
        min: Minimum allowed value.
        max: Maximum allowed value.
        step: Step increment.
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[float] = None
    disabled: bool = False
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="number", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "number", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.min is not None:
            d["min"] = self.min
        if self.max is not None:
            d["max"] = self.max
        if self.step is not None:
            d["step"] = self.step
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Select(Field):
    """A dropdown select field.

    Args:
        name: Form field key (required).
        options: List of selectable options.
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default selected value.
        disabled: Whether the field is disabled.
        hidden_when: Conditional visibility rule.
    """

    name: str
    options: List[Option]
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[str] = None
    disabled: bool = False
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="select", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "type": "select",
            "name": self.name,
            "options": [o.to_dict() for o in self.options],
        }
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class MultiSelect(Field):
    """A multi-select field (popover + command palette style).

    Args:
        name: Form field key (required).
        options: List of selectable options.
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default selected values.
        disabled: Whether the field is disabled.
        min_items: Minimum number of selections required.
        max_items: Maximum number of selections allowed.
        hidden_when: Conditional visibility rule.
    """

    name: str
    options: List[Option]
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[List[str]] = None
    disabled: bool = False
    min_items: Optional[int] = None
    max_items: Optional[int] = None
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="multiselect", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "type": "multiselect",
            "name": self.name,
            "options": [o.to_dict() for o in self.options],
        }
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.min_items is not None:
            d["min_items"] = self.min_items
        if self.max_items is not None:
            d["max_items"] = self.max_items
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Radio(Field):
    """A radio button group.

    Args:
        name: Form field key (required).
        options: List of selectable options.
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default selected value.
        disabled: Whether the field is disabled.
        hidden_when: Conditional visibility rule.
    """

    name: str
    options: List[Option]
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[str] = None
    disabled: bool = False
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="radio", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "type": "radio",
            "name": self.name,
            "options": [o.to_dict() for o in self.options],
        }
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Checkbox(Field):
    """A single boolean checkbox.

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default checked state.
        disabled: Whether the field is disabled.
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: bool = False
    disabled: bool = False
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="checkbox", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "checkbox", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Switch(Field):
    """A toggle switch (boolean).

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default toggled state.
        disabled: Whether the field is disabled.
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: bool = False
    disabled: bool = False
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="switch", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "switch", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Date(Field):
    """A date picker field.

    Args:
        name: Form field key (required).
        label: Human-readable label.
        help: Muted help text.
        required: Whether the field is required.
        default: Default date string (ISO 8601).
        disabled: Whether the field is disabled.
        min_date: Earliest selectable date (ISO 8601).
        max_date: Latest selectable date (ISO 8601).
        hidden_when: Conditional visibility rule.
    """

    name: str
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    default: Optional[str] = None
    disabled: bool = False
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="date", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": "date", "name": self.name}
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.default is not None:
            d["default"] = self.default
        if self.disabled:
            d["disabled"] = self.disabled
        if self.min_date is not None:
            d["min_date"] = self.min_date
        if self.max_date is not None:
            d["max_date"] = self.max_date
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class ButtonGroup(Field):
    """A row of buttons — clicking one immediately submits the form.

    Args:
        name: Form field key (required).
        options: List of button options (each may have a ``variant``).
        label: Human-readable label shown above the buttons.
        help: Muted help text.
        required: Whether a selection is required.
        hidden_when: Conditional visibility rule.
    """

    name: str
    options: List[Option]
    label: Optional[str] = None
    help: Optional[str] = None
    required: bool = False
    hidden_when: Optional[HiddenWhen] = None
    _type: str = field(default="button_group", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "type": "button_group",
            "name": self.name,
            "options": [o.to_dict() for o in self.options],
        }
        if self.label is not None:
            d["label"] = self.label
        if self.help is not None:
            d["help"] = self.help
        if self.required:
            d["required"] = self.required
        if self.hidden_when is not None:
            d["hidden_when"] = self.hidden_when.to_dict()
        return d


@dataclass
class Divider(Field):
    """A horizontal separator (no name, no value).

    Maps to shadcn ``Separator``.
    """

    _type: str = field(default="divider", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        return {"type": "divider"}


@dataclass
class Heading(Field):
    """A heading / sub-title block.

    Args:
        text: Heading text to render.
    """

    text: str
    _type: str = field(default="heading", init=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        return {"type": "heading", "text": self.text}


# ---------------------------------------------------------------------------
# Form
# ---------------------------------------------------------------------------


@dataclass
class Form:
    """Top-level HITL form schema.

    Call ``to_dict()`` to get a JSON-serialisable dict suitable for
    ``app.pause(form_schema=...)``.

    Args:
        title: Required heading shown at the top of the form.
        description: Optional markdown rendered above the fields.
        tags: Optional list of tags for inbox filtering.
        priority: Optional priority badge: ``"low"``, ``"normal"``,
            ``"high"``, or ``"urgent"``.
        fields: Ordered list of form fields.
        submit_label: Label for the submit button.  Defaults to ``"Submit"``
            on the control plane.  Overridden when the form contains a
            ``ButtonGroup`` field (the buttons act as submit).
        cancel_label: Optional cancel button label.  When set, a cancel
            button is shown; clicking it submits ``{_cancelled: true}``.
    """

    title: str
    fields: List[Field]
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    priority: Optional[Literal["low", "normal", "high", "urgent"]] = None
    submit_label: Optional[str] = None
    cancel_label: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-serialisable representation of the form schema."""
        d: Dict[str, Any] = {
            "title": self.title,
            "fields": [f.to_dict() for f in self.fields],
        }
        if self.description is not None:
            d["description"] = self.description
        if self.tags:
            d["tags"] = self.tags
        if self.priority is not None:
            d["priority"] = self.priority
        if self.submit_label is not None:
            d["submit_label"] = self.submit_label
        if self.cancel_label is not None:
            d["cancel_label"] = self.cancel_label
        return d


__all__ = [
    "Form",
    "Field",
    "Option",
    "HiddenWhen",
    "Markdown",
    "Text",
    "Textarea",
    "Number",
    "Select",
    "MultiSelect",
    "Radio",
    "Checkbox",
    "Switch",
    "Date",
    "ButtonGroup",
    "Divider",
    "Heading",
]
