"""Order lifecycle rules — pure Python, no FastAPI, no SQLAlchemy, unit-tested in microseconds.

CREATED -> CONFIRMED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED, and any non-terminal -> CANCELED.
See docs/03-modelagem-de-dados.md §6.
"""

import enum
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


class OrderStatus(enum.StrEnum):
    CREATED = "created"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELED = "canceled"


TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.CREATED: frozenset({OrderStatus.CONFIRMED, OrderStatus.CANCELED}),
    OrderStatus.CONFIRMED: frozenset({OrderStatus.PREPARING, OrderStatus.CANCELED}),
    OrderStatus.PREPARING: frozenset({OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELED}),
    OrderStatus.OUT_FOR_DELIVERY: frozenset({OrderStatus.DELIVERED, OrderStatus.CANCELED}),
    OrderStatus.DELIVERED: frozenset(),
    OrderStatus.CANCELED: frozenset(),
}

TERMINAL = frozenset({OrderStatus.DELIVERED, OrderStatus.CANCELED})

# Customers may only cancel, and only before the kitchen starts.
CUSTOMER_CANCELLABLE = frozenset({OrderStatus.CREATED, OrderStatus.CONFIRMED})

TIMESTAMP_FIELD: dict[OrderStatus, str] = {
    OrderStatus.CONFIRMED: "confirmed_at",
    OrderStatus.PREPARING: "preparing_at",
    OrderStatus.OUT_FOR_DELIVERY: "out_for_delivery_at",
    OrderStatus.DELIVERED: "delivered_at",
    OrderStatus.CANCELED: "canceled_at",
}

DEFAULT_DESCRIPTIONS: dict[OrderStatus, str] = {
    OrderStatus.CREATED: "Pedido recebido.",
    OrderStatus.CONFIRMED: "Pedido confirmado pelo restaurante.",
    OrderStatus.PREPARING: "Pedido em preparo.",
    OrderStatus.OUT_FOR_DELIVERY: "Pedido saiu para entrega.",
    OrderStatus.DELIVERED: "Pedido entregue.",
    OrderStatus.CANCELED: "Pedido cancelado.",
}


class TransitionError(Exception):
    """Base class; ``code`` is a stable machine-readable reason."""

    code = "invalid_transition"


class InvalidTransition(TransitionError):
    code = "invalid_transition"


class TransitionNotAllowed(TransitionError):
    code = "transition_not_allowed"


@dataclass(frozen=True)
class Actor:
    user_id: int
    is_admin: bool


def ensure_transition(current: OrderStatus, target: OrderStatus, actor: Actor, owner_id: int) -> None:
    if current == target:
        raise InvalidTransition(f"Pedido ja esta '{current.value}'.")
    if target not in TRANSITIONS[current]:
        raise InvalidTransition(f"Transicao invalida: {current.value} -> {target.value}.")
    if actor.is_admin:
        return
    if actor.user_id != owner_id:
        raise TransitionNotAllowed("Sem permissao para alterar este pedido.")
    if target != OrderStatus.CANCELED:
        raise TransitionNotAllowed("Cliente so pode cancelar o pedido.")
    if current not in CUSTOMER_CANCELLABLE:
        raise TransitionNotAllowed("O pedido ja esta em preparo e nao pode mais ser cancelado.")


CENT = Decimal("0.01")


@dataclass(frozen=True)
class LineInput:
    product_id: int
    quantity: int


def merge_lines(lines: Iterable[LineInput]) -> list[LineInput]:
    """Two lines for the same product become one (keeps totals and stock math simple)."""
    merged: dict[int, int] = {}
    for line in lines:
        merged[line.product_id] = merged.get(line.product_id, 0) + line.quantity
    return [LineInput(product_id=pid, quantity=qty) for pid, qty in merged.items()]


def line_total(unit_price: Decimal, quantity: int) -> Decimal:
    return (unit_price * quantity).quantize(CENT, rounding=ROUND_HALF_UP)
