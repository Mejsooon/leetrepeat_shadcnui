"""LeetRepeat v3 — start aplikacji. Uruchomienie: python main.py → http://127.0.0.1:8000

Warstwy backendu (folder backend/):
    api/          endpointy HTTP (routes.py) i walidacja danych (schemas.py)
    services/     logika: powtórki, statystyki, uruchamianie kodu (runner.py)
    repository/   cały SQL
    core/         połączenie z bazą i schemat tabel (database.py)
Frontend: zbudowany React w frontend/dist (zmiany: cd frontend && npm run build)
"""
import os

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

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
    app.include_router(create_router(db_path))

    dist_dir = os.path.abspath(dist_dir)
    index_file = os.path.join(dist_dir, "index.html")
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Wszystko poza /api to frontend: istniejący plik z dist albo index.html (React Router sam wybierze ekran)
    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        if not os.path.isfile(index_file):
            return HTMLResponse(MISSING_DIST, status_code=503)
        file_path = os.path.abspath(os.path.join(dist_dir, path))
        # Plik musi leżeć wewnątrz dist — ścieżki typu ../ nie wychodzą poza folder
        if path and file_path.startswith(dist_dir + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(index_file)

    return app


app = create_app(os.environ.get("LEETREPEAT_DB", os.path.join(ROOT, "leetrepeat.db")),
                 os.path.join(ROOT, "frontend", "dist"))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
