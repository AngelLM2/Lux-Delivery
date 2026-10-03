from decimal import Decimal
from itertools import pairwise

import pytest

from app.modules.ordering.domain import (
    TERMINAL,
    TRANSITIONS,
    Actor,
    InvalidTransition,
    LineInput,
    OrderStatus,
    TransitionNotAllowed,
    ensure_transition,
    line_total,
    merge_lines,
)

ADMIN = Actor(user_id=1, is_admin=True)
OWNER = Actor(user_id=2, is_admin=False)
STRANGER = Actor(user_id=3, is_admin=False)
S = OrderStatus

HAPPY_PATH = [S.CREATED, S.CONFIRMED, S.PREPARING, S.OUT_FOR_DELIVERY, S.DELIVERED]


def test_admin_can_walk_the_happy_path():
    for current, target in pairwise(HAPPY_PATH):
        ensure_transition(current, target, ADMIN, owner_id=OWNER.user_id)


@pytest.mark.parametrize("current", [S.CREATED, S.CONFIRMED, S.PREPARING, S.OUT_FOR_DELIVERY])
def test_admin_can_cancel_any_non_terminal_order(current):
    ensure_transition(current, S.CANCELED, ADMIN, owner_id=OWNER.user_id)


@pytest.mark.parametrize("terminal", sorted(TERMINAL))
def test_terminal_states_have_no_exit(terminal):
    assert TRANSITIONS[terminal] == frozenset()
    for target in OrderStatus:
        with pytest.raises(InvalidTransition):
            ensure_transition(terminal, target, ADMIN, owner_id=OWNER.user_id)


@pytest.mark.parametrize(
    ("current", "target"),
    [(S.CREATED, S.PREPARING), (S.CREATED, S.DELIVERED), (S.CONFIRMED, S.OUT_FOR_DELIVERY), (S.PREPARING, S.CONFIRMED)],
)
def test_skipping_or_going_back_is_invalid(current, target):
    with pytest.raises(InvalidTransition):
        ensure_transition(current, target, ADMIN, owner_id=OWNER.user_id)


def test_same_status_is_invalid():
    with pytest.raises(InvalidTransition, match="ja esta"):
        ensure_transition(S.CONFIRMED, S.CONFIRMED, ADMIN, owner_id=OWNER.user_id)


@pytest.mark.parametrize("current", [S.CREATED, S.CONFIRMED])
def test_owner_can_cancel_before_kitchen_starts(current):
    ensure_transition(current, S.CANCELED, OWNER, owner_id=OWNER.user_id)


@pytest.mark.parametrize("current", [S.PREPARING, S.OUT_FOR_DELIVERY])
def test_owner_cannot_cancel_after_kitchen_starts(current):
    with pytest.raises(TransitionNotAllowed):
        ensure_transition(current, S.CANCELED, OWNER, owner_id=OWNER.user_id)


def test_owner_cannot_confirm_own_order():
    with pytest.raises(TransitionNotAllowed, match="so pode cancelar"):
        ensure_transition(S.CREATED, S.CONFIRMED, OWNER, owner_id=OWNER.user_id)


def test_other_customer_cannot_touch_the_order():
    with pytest.raises(TransitionNotAllowed):
        ensure_transition(S.CREATED, S.CANCELED, STRANGER, owner_id=OWNER.user_id)


def test_invalid_transition_is_checked_before_permissions():
    # A customer asking for an impossible move gets the "invalid" error, not "forbidden".
    with pytest.raises(InvalidTransition):
        ensure_transition(S.DELIVERED, S.CANCELED, OWNER, owner_id=OWNER.user_id)


def test_merge_lines_sums_quantities_of_the_same_product():
    merged = merge_lines([LineInput(1, 2), LineInput(2, 1), LineInput(1, 3)])
    assert sorted((line.product_id, line.quantity) for line in merged) == [(1, 5), (2, 1)]


@pytest.mark.parametrize(
    ("price", "qty", "expected"),
    [("33.33", 3, "99.99"), ("0.10", 3, "0.30"), ("19.995", 1, "20.00"), ("12.50", 2, "25.00")],
)
def test_line_total_uses_exact_decimal_math(price, qty, expected):
    assert line_total(Decimal(price), qty) == Decimal(expected)


def test_float_would_have_been_wrong():
    # The reason money is NUMERIC: binary floats cannot represent 0.1 exactly.
    assert 0.1 * 3 != 0.3
    assert line_total(Decimal("0.1"), 3) == Decimal("0.30")
