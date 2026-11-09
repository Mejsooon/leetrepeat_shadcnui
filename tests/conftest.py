import os
import sys

import pytest

# Katalog repo na ścieżce importów, żeby działało `from backend... import ...`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.database import connect  # noqa: E402


@pytest.fixture
def db():
    con = connect(":memory:")
    yield con
    con.close()
