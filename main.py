"""LeetRepeat v3 — start aplikacji. Uruchomienie: python main.py → http://127.0.0.1:8000

Warstwy backendu (folder backend/):
    api/          endpointy HTTP (routes.py) i walidacja danych (schemas.py)
    services/     logika: powtórki, statystyki, uruchamianie kodu (runner.py)
    repository/   cały SQL
    core/         połączenie z bazą i schemat tabel (database.py)
Frontend: zbudowany React w frontend/dist (zmiany: cd frontend && npm run build)
"""
import os
from urllib.parse import urlsplit

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.api.errors import polish_message
from backend.api.routes import create_router
from backend.core.database import connect

ROOT = os.path.dirname(os.path.abspath(__file__))

MISSING_DIST = """<!doctype html><html lang="pl"><meta charset="utf-8"><title>LeetRepeat</title>
<body style="font-family: system-ui, sans-serif; padding: 40px">
<h1>Brak zbudowanego frontendu (frontend/dist)</h1>
<p>Uruchom: <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>, a potem ponownie <code>python main.py</code>.</p>
</body></html>"""


def create_app(db_path: str, dist_dir: str) -> FastAPI:
    # Baza z tabelami powstaje od razu przy starcie
    connect(db_path).close()

    app = FastAPI(title="LeetRepeat")
    # Tylko adresy lokalne: strona z internetu podszywająca się pod 127.0.0.1 (DNS rebinding)
    # dostanie 400 i nie uruchomi kodu na tym komputerze
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    # Obca strona może wysłać POST na 127.0.0.1 z prawdziwym nagłówkiem Host (np. fetch "no-cors").
    # Przeglądarka dokleja wtedy Origin / Sec-Fetch-Site — po nich odrzucamy każdą zmianę danych i /api/run.
    @app.middleware("http")
    async def block_cross_site(request: Request, call_next):
        path = request.url.path
        changes_data = request.method in ("POST", "PUT", "PATCH", "DELETE") and path.startswith("/api/")
        # GET /api/backup też: robi kopię i zapisuje „ostatnią kopię”, więc obca strona nie może go wywołać
        if changes_data or (request.method == "GET" and path == "/api/backup"):
            cross_site = request.headers.get("sec-fetch-site") == "cross-site"
            origin = request.headers.get("origin")
            allowed_origin = True
            if origin is not None:
                parts = urlsplit(origin)
                # Port serwera bierzemy z nagłówka Host (np. 127.0.0.1:8000); bez portu = 80
                host_port = urlsplit("//" + request.headers.get("host", "")).port or 80
                try:
                    origin_port = parts.port or 80
                except ValueError:
                    origin_port = None
                allowed_origin = parts.hostname in ("127.0.0.1", "localhost") and origin_port in (host_port, 5173)
            if cross_site or not allowed_origin:
                return JSONResponse({"detail": "Żądanie z innej strony zostało zablokowane"}, status_code=403)
        return await call_next(request)

    # 422 z walidacji: jeden czytelny komunikat po polsku zamiast listy błędów Pydantica
    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse({"detail": polish_message(exc.errors()[0])}, status_code=422)

    app.include_router(create_router(db_path))

    dist_dir = os.path.abspath(dist_dir)
    index_file = os.path.join(dist_dir, "index.html")
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Wszystko poza /api to frontend: istniejący plik z dist albo index.html (React Router sam wybierze ekran)
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        if not os.path.isfile(index_file):
            return HTMLResponse(MISSING_DIST, status_code=503)
        file_path = os.path.abspath(os.path.join(dist_dir, path))
        # Plik musi leżeć wewnątrz dist — ścieżki typu ../ nie wychodzą poza folder
        if path and file_path.startswith(dist_dir + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Brakujący plik (np. /favicon.ico) to 404, a nie strona aplikacji — trasy React nie mają kropek
        if "." in path.rsplit("/", 1)[-1]:
            return PlainTextResponse("Nie znaleziono", status_code=404)
        return FileResponse(index_file)

    return app


app = create_app(os.environ.get("LEETREPEAT_DB", os.path.join(ROOT, "leetrepeat.db")),
                 os.path.join(ROOT, "frontend", "dist"))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
