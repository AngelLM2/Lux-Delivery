"""Captures the README screenshots from the running stack with headless Chrome (DevTools Protocol).

    python scripts/capture_screenshots.py            # stack at http://localhost:8080, Grafana at :3001

Uses a throwaway Chrome profile and saves PNGs to docs/img/. Requires: httpx, websockets.
"""

import asyncio
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import httpx
import websockets

BASE = os.environ.get("BASE_URL", "http://localhost:8080")
GRAFANA = os.environ.get("GRAFANA_URL", "http://localhost:3001")
OUT = Path(__file__).resolve().parents[1] / "docs" / "img"
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
PORT = 9333


class Tab:
    def __init__(self, ws):
        self.ws, self.next_id = ws, 0

    async def call(self, method: str, **params):
        self.next_id += 1
        my_id = self.next_id
        await self.ws.send(json.dumps({"id": my_id, "method": method, "params": params}))
        while True:
            message = json.loads(await self.ws.recv())
            if message.get("id") == my_id:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})

    async def shot(self, url: str, name: str, width=1440, height=900, wait=3.0, full=False):
        await self.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1,
                        mobile=width < 600)
        await self.call("Page.navigate", url=url)
        await asyncio.sleep(wait)
        params = {"format": "png", "captureBeyondViewport": full}
        data = (await self.call("Page.captureScreenshot", **params))["data"]
        (OUT / name).write_bytes(base64.b64decode(data))
        print(f"saved docs/img/{name}")


def login(email: str, password: str) -> dict[str, str]:
    response = httpx.post(f"{BASE}/api/v1/auth/login", json={"email": email, "password": password})
    response.raise_for_status()
    return {name: value for name, value in response.cookies.items()}


def prepare_live_order(customer: dict, admin: dict) -> int:
    """A fresh order that is 'out for delivery', so the timeline screenshot shows real progress."""
    with httpx.Client(base_url=BASE, cookies=customer) as client:
        products = client.get("/api/v1/products", params={"limit": 6}).json()["items"]
        order = client.post(
            "/api/v1/orders",
            json={
                "delivery_address": "Rua Oscar Freire, 900 - Sao Paulo/SP",
                "notes": "Interfone 42",
                "items": [{"product_id": products[0]["id"], "quantity": 1}, {"product_id": products[4]["id"], "quantity": 2}],
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
        ).json()
    with httpx.Client(base_url=BASE, cookies=admin) as client:
        for status in ("confirmed", "preparing", "out_for_delivery"):
            client.patch(f"/api/v1/orders/{order['id']}/status", json={"status": status})
            time.sleep(0.4)
    return order["id"]


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    customer = login("cliente@lux.dev", "Cliente@12345")
    admin = login("admin@lux.dev", "Admin@12345")
    order_id = prepare_live_order(customer, admin)

    profile = tempfile.mkdtemp(prefix="lux-shots-")
    chrome = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
         "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=1440,900", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            try:
                targets = httpx.get(f"http://127.0.0.1:{PORT}/json").json()
                page = next(t for t in targets if t["type"] == "page")
                break
            except Exception:
                await asyncio.sleep(0.2)
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
            tab = Tab(ws)
            await tab.call("Page.enable")
            await tab.call("Network.enable")

            await tab.shot(f"{BASE}/", "home.png", wait=4)
            await tab.shot(f"{BASE}/menu", "menu.png", wait=3)
            await tab.shot(f"{BASE}/", "home-mobile.png", width=390, height=844, wait=3)

            async def as_user(cookies: dict) -> None:
                await tab.call("Network.clearBrowserCookies")
                for name, value in cookies.items():
                    path = "/api/v1/auth" if name == "lux_refresh" else "/"
                    await tab.call("Network.setCookie", name=name, value=value, domain="localhost", path=path,
                                   httpOnly=True, sameSite="Strict")

            await as_user(customer)
            await tab.shot(f"{BASE}/orders/{order_id}", "order-tracking.png", wait=4)
            await as_user(admin)
            await tab.shot(f"{BASE}/admin", "admin-dashboard.png", wait=5)
            await tab.shot(f"{BASE}/admin/orders", "admin-orders.png", wait=4)
            await tab.call("Network.clearBrowserCookies")
            await tab.shot(f"{GRAFANA}/d/lux-overview?orgId=1&refresh=off&from=now-15m&to=now&kiosk", "grafana.png",
                           width=1600, height=1000, wait=8)
    finally:
        chrome.terminate()
        chrome.wait(timeout=10)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
