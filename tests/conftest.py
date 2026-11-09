import os
import sys

import pytest
from fastapi.testclient import TestClient

# Katalog repo na ścieżce importów, żeby działało `from backend... import ...`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import connect  # noqa: E402


@pytest.fixture
def db():
    con = connect(":memory:")
    yield con
    con.close()


@pytest.fixture
def app(tmp_path):
    from main import create_app
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    return create_app(str(tmp_path / "test.db"), str(dist))


@pytest.fixture
def client(app):
    return TestClient(app, base_url="http://127.0.0.1")
