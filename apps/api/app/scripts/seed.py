"""Demo data: ``python -m app.scripts.seed [--orders 1500] [--days 60] [--reset]``.

Idempotent (upserts by natural key; orders only into an empty table or with --reset) and
deterministic (fixed random seed), so screenshots and load tests are reproducible.
"""

import argparse
import asyncio
import os
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, insert, select, text

import app.models  # noqa: F401
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.modules.catalog.models import Category, Product
from app.modules.identity.models import User, UserRole
from app.modules.notifications.models import Notification
from app.modules.ordering.domain import DEFAULT_DESCRIPTIONS, OrderStatus, line_total
from app.modules.ordering.models import Order, OrderItem, OrderTrackingEvent

IMG = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w=900&q=70"

CATALOG: dict[str, list[tuple[str, str, str, str, dict]]] = {
    # category: [(name, price, short, image id, flags)]
    "Entradas": [
        (
            "Burrata com tomates confit",
            "58.00",
            "Burrata cremosa, tomates assados e manjericao",
            "1608897013039-887f21d8c804",
            {"highlights": True},
        ),
        (
            "Bruschetta da casa",
            "36.00",
            "Pao de fermentacao natural, tomate e azeite",
            "1572695157366-5e585ab2b69f",
            {},
        ),
        (
            "Carpaccio classico",
            "54.00",
            "Fatias finas de file, alcaparras e parmesao",
            "1541529086526-db283c563270",
            {},
        ),
        (
            "Salada verde da horta",
            "38.00",
            "Folhas organicas e vinagrete de mostarda",
            "1540189549336-e6e99c3679fe",
            {"is_offer": True},
        ),
    ],
    "Massas": [
        (
            "Spaghetti alla carbonara",
            "72.00",
            "Guanciale, pecorino e gema curada",
            "1563379926898-05f4575a45d8",
            {"highlights": True},
        ),
        ("Fettuccine ao pomodoro", "62.00", "Molho de tomate San Marzano e manjericao", "1551183053-bf91a1d81141", {}),
        ("Lasanha bolonhesa", "78.00", "Ragu cozido por 8 horas e bechamel", "1619895092538-128341789043", {}),
        (
            "Penne ao pesto",
            "64.00",
            "Pesto genoves, pinoli e parmesao",
            "1473093295043-cdd812d0e601",
            {"is_offer": True},
        ),
        (
            "Risoto de cogumelos",
            "82.00",
            "Arborio, funghi secchi e manteiga noisette",
            "1476124369491-e7addf5db371",
            {},
        ),
    ],
    "Pratos principais": [
        (
            "File ao molho de vinho",
            "118.00",
            "File mignon, reducao de vinho tinto e pure",
            "1600891964092-4316c288032e",
            {"highlights": True},
        ),
        ("Salmao grelhado", "104.00", "Salmao, legumes da estacao e beurre blanc", "1467003909585-2f8a72700288", {}),
        (
            "Costela assada lentamente",
            "112.00",
            "Costela bovina, barbecue da casa e farofa",
            "1544025162-d76694265947",
            {},
        ),
        (
            "Bowl mediterraneo",
            "68.00",
            "Quinoa, grao-de-bico, homus e vegetais",
            "1512621776951-a57141f2eefd",
            {"is_offer": True},
        ),
        ("Espetinhos na brasa", "86.00", "Mix de carnes marinadas e chimichurri", "1555939594-58d7cb561ad1", {}),
    ],
    "Sobremesas": [
        ("Tiramisu", "34.00", "Mascarpone, cafe e cacau", "1571877227200-a0d98ea607e9", {"highlights": True}),
        (
            "Cheesecake de frutas vermelhas",
            "32.00",
            "Base crocante e calda de frutas",
            "1533134242443-d4fd215305ad",
            {},
        ),
        ("Bolo de chocolate belga", "30.00", "70% cacau com sorvete de baunilha", "1578985545062-69928b1d9587", {}),
        ("Gelato artesanal", "24.00", "Duas bolas, sabores do dia", "1563805042-7684c019e1cb", {"is_offer": True}),
    ],
    "Bebidas": [
        ("Limonada siciliana", "16.00", "Limao siciliano, hortela e agua com gas", "1556679343-c7306c1976bc", {}),
        ("Suco de laranja", "14.00", "Espremido na hora", "1513558161293-cdaf765ed2fd", {}),
        ("Espresso", "9.00", "Graos especiais torrados na casa", "1509042239860-f550ce710b93", {}),
        ("Drink da casa", "38.00", "Gin, tonica artesanal e especiarias", "1551024709-8f23befc6f87", {}),
    ],
    "Vinhos": [
        (
            "Tinto reserva (garrafa)",
            "189.00",
            "Cabernet Sauvignon, 12 meses em carvalho",
            "1510812431401-41d2bd2722f3",
            {"highlights": True},
        ),
        ("Branco seco (garrafa)", "149.00", "Sauvignon Blanc, notas citricas", "1474722883778-792e7990302f", {}),
        ("Taca de espumante", "42.00", "Brut, metodo tradicional", "1553361371-9b22f78e8b1d", {}),
    ],
}

FIRST_NAMES = [
    "Ana",
    "Bruno",
    "Carla",
    "Diego",
    "Elisa",
    "Felipe",
    "Gabriela",
    "Hugo",
    "Isabela",
    "Joao",
    "Karina",
    "Lucas",
    "Mariana",
    "Nicolas",
    "Olivia",
    "Pedro",
    "Rafaela",
    "Samuel",
    "Tatiana",
    "Vitor",
]
LAST_NAMES = ["Almeida", "Barbosa", "Costa", "Dias", "Ferreira", "Gomes", "Lima", "Martins", "Oliveira", "Souza"]
STREETS = ["Rua Augusta", "Av. Paulista", "Rua Oscar Freire", "Rua Haddock Lobo", "Al. Santos", "Rua da Consolacao"]


def _business_moment(rng: random.Random, day: datetime) -> datetime:
    """Lunch (11-14h) and dinner (18-23h) peaks, a thin afternoon in between."""
    bucket = rng.choices(["lunch", "afternoon", "dinner"], weights=[38, 12, 50])[0]
    hour = {"lunch": rng.uniform(11, 14.5), "afternoon": rng.uniform(14.5, 18), "dinner": rng.uniform(18, 23)}[bucket]
    return day + timedelta(hours=hour)


async def _upsert_users(session) -> tuple[User, User, list[int]]:
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@lux.dev")
    customer_email = os.getenv("SEED_CUSTOMER_EMAIL", "cliente@lux.dev")
    admin = (await session.execute(select(User).where(User.email == admin_email))).scalar_one_or_none()
    if admin is None:
        admin = User(
            full_name="Admin Lux",
            email=admin_email,
            hashed_password=await hash_password(os.getenv("SEED_ADMIN_PASSWORD", "Admin@12345")),
            role=UserRole.ADMIN,
        )
        session.add(admin)
    customer = (await session.execute(select(User).where(User.email == customer_email))).scalar_one_or_none()
    if customer is None:
        customer = User(
            full_name="Cliente Demo",
            email=customer_email,
            phone="+55 11 99999-0000",
            hashed_password=await hash_password(os.getenv("SEED_CUSTOMER_PASSWORD", "Cliente@12345")),
            role=UserRole.CUSTOMER,
        )
        session.add(customer)
    await session.flush()

    # Extra customers share one hash: bcrypt per user would make the seed take a minute.
    shared_hash = await hash_password("Cliente@12345")
    existing = set((await session.execute(select(User.email).where(User.email.like("%@demo.lux.dev")))).scalars())
    rows = []
    for i, (first, last) in enumerate((f, last_name) for f in FIRST_NAMES for last_name in LAST_NAMES[:2]):
        email = f"{first.lower()}.{last.lower()}{i}@demo.lux.dev"
        if email not in existing:
            rows.append(
                {
                    "full_name": f"{first} {last}",
                    "email": email,
                    "hashed_password": shared_hash,
                    "role": UserRole.CUSTOMER,
                    "is_active": True,
                }
            )
    if rows:
        await session.execute(insert(User), rows)
    ids = list((await session.execute(select(User.id).where(User.role == UserRole.CUSTOMER))).scalars())
    return admin, customer, ids


async def _upsert_catalog(session) -> list[Product]:
    for position, category_name in enumerate(CATALOG):
        category = (await session.execute(select(Category).where(Category.name == category_name))).scalar_one_or_none()
        if category is None:
            category = Category(name=category_name, position=position)
            session.add(category)
            await session.flush()
        for name, price, short, image, flags in CATALOG[category_name]:
            exists = (
                await session.execute(select(Product.id).where(func.lower(Product.name) == name.lower()))
            ).scalar_one_or_none()
            if exists:
                continue
            session.add(
                Product(
                    name=name,
                    price=Decimal(price),
                    short_description=short,
                    description=f"{short}. Preparado na hora pela nossa cozinha.",
                    image_url=IMG.format(image),
                    category_id=category.id,
                    is_offer=flags.get("is_offer", False),
                    highlights=flags.get("highlights", False),
                )
            )
    await session.flush()
    return list((await session.execute(select(Product).where(Product.archived_at.is_(None)))).scalars())


async def _generate_orders(session, rng, customer_ids, demo_customer_id, admin_id, products, n_orders, days):
    tz = ZoneInfo(settings.BUSINESS_TIMEZONE)
    now = datetime.now(UTC)
    today_local = now.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    weights = [3 if p.highlights else 1 for p in products]

    orders, items, events, notifications = [], [], [], []
    next_id = (await session.execute(text("SELECT nextval('orders_id_seq')"))).scalar_one()
    for n in range(n_orders):
        # Slight growth trend: recent days get more orders.
        day_offset = int(days * (1 - rng.random() ** 1.6))
        day = today_local - timedelta(days=day_offset)
        created_local = _business_moment(rng, day)
        created = created_local.astimezone(UTC)
        if created > now - timedelta(minutes=5):
            created = now - timedelta(minutes=rng.randint(6, 90))
        age = now - created

        customer_id = demo_customer_id if rng.random() < 0.04 else rng.choice(customer_ids)
        chosen = rng.choices(products, weights=weights, k=rng.randint(1, 4))
        lines: dict[int, tuple[Product, int]] = {}
        for p in chosen:
            qty = lines.get(p.id, (p, 0))[1] + rng.choice([1, 1, 1, 2])
            lines[p.id] = (p, qty)

        # Final status depends on how old the order is (recent ones are still in progress).
        timeline = [(OrderStatus.CREATED, created)]
        t = created
        steps = [
            (OrderStatus.CONFIRMED, rng.uniform(1, 6)),
            (OrderStatus.PREPARING, rng.uniform(2, 8)),
            (OrderStatus.OUT_FOR_DELIVERY, rng.uniform(12, 30)),
            (OrderStatus.DELIVERED, rng.uniform(12, 38)),
        ]
        canceled = rng.random() < 0.07
        cancel_at = rng.randint(0, 2) if canceled else None
        for idx, (status, minutes) in enumerate(steps):
            if cancel_at is not None and idx == cancel_at:
                t += timedelta(minutes=rng.uniform(1, 10))
                if t < now:
                    timeline.append((OrderStatus.CANCELED, t))
                break
            t += timedelta(minutes=minutes)
            if t >= now:
                break
            timeline.append((status, t))

        order_id = next_id + n
        total = Decimal("0")
        for product, qty in lines.values():
            lt = line_total(product.price, qty)
            total += lt
            items.append(
                {
                    "order_id": order_id,
                    "product_id": product.id,
                    "product_name": product.name,
                    "quantity": qty,
                    "unit_price": product.price,
                    "total_price": lt,
                }
            )
        stamps = {s: ts for s, ts in timeline}
        final_status = timeline[-1][0]
        orders.append(
            {
                "id": order_id,
                "customer_id": customer_id,
                "status": final_status,
                "total_amount": total,
                "delivery_address": f"{rng.choice(STREETS)}, {rng.randint(10, 2500)} - Sao Paulo/SP",
                "notes": rng.choice([None, None, None, "Sem cebola, por favor.", "Interfone 42.", "Troco para 200."]),
                "created_at": created,
                "updated_at": timeline[-1][1],
                "confirmed_at": stamps.get(OrderStatus.CONFIRMED),
                "preparing_at": stamps.get(OrderStatus.PREPARING),
                "out_for_delivery_at": stamps.get(OrderStatus.OUT_FOR_DELIVERY),
                "delivered_at": stamps.get(OrderStatus.DELIVERED),
                "canceled_at": stamps.get(OrderStatus.CANCELED),
            }
        )
        for status, ts in timeline:
            events.append(
                {
                    "order_id": order_id,
                    "status": status,
                    "description": DEFAULT_DESCRIPTIONS[status],
                    "created_by_user_id": customer_id if status == OrderStatus.CREATED else admin_id,
                    "created_at": ts,
                }
            )
        if customer_id == demo_customer_id and age < timedelta(days=10):
            notifications.append(
                {
                    "user_id": customer_id,
                    "order_id": order_id,
                    "event_type": f"order_{final_status.value}",
                    "message": f"Pedido #{order_id}: {DEFAULT_DESCRIPTIONS[final_status]}",
                    "is_read": age > timedelta(days=2),
                    "created_at": timeline[-1][1],
                }
            )

    for chunk_start in range(0, len(orders), 500):
        await session.execute(insert(Order), orders[chunk_start : chunk_start + 500])
    for table, rows in ((OrderItem, items), (OrderTrackingEvent, events), (Notification, notifications)):
        for chunk_start in range(0, len(rows), 1000):
            await session.execute(insert(table), rows[chunk_start : chunk_start + 1000])
    await session.execute(text("SELECT setval('orders_id_seq', (SELECT max(id) FROM orders))"))
    return len(orders)


async def seed(n_orders: int, days: int, reset: bool) -> None:
    rng = random.Random(42)
    async with SessionLocal() as session:
        if reset:
            await session.execute(
                text(
                    "TRUNCATE notifications, order_tracking_events, order_items, idempotency_keys, outbox_events, "
                    "orders "
                    "RESTART IDENTITY CASCADE"
                )
            )
        admin, customer, customer_ids = await _upsert_users(session)
        products = await _upsert_catalog(session)
        created = 0
        if not (await session.execute(select(Order.id).limit(1))).first():
            created = await _generate_orders(
                session, rng, customer_ids, customer.id, admin.id, products, n_orders, days
            )
        await session.commit()
    await engine.dispose()
    print(f"seed ok: {len(customer_ids)} clientes, {len(products)} produtos, {created} pedidos gerados")
    print(f"admin: {admin.email} | cliente: {customer.email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Popula o banco com dados de demonstracao.")
    parser.add_argument("--orders", type=int, default=1500)
    parser.add_argument("--days", type=int, default=60)
    parser.add_argument("--reset", action="store_true", help="apaga pedidos existentes antes de gerar")
    args = parser.parse_args()
    asyncio.run(seed(args.orders, args.days, args.reset))


if __name__ == "__main__":
    main()
