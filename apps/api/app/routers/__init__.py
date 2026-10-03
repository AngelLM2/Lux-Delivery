from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.category import router as category_router
from app.routers.notification import router as notification_router
from app.routers.order import router as order_router
from app.routers.product import router as product_router
from app.routers.user import router as user_router

__all__ = [
    "analytics_router",
    "auth_router",
    "category_router",
    "notification_router",
    "order_router",
    "product_router",
    "user_router",
]
