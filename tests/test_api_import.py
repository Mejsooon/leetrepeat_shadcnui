import json

TASK = {
    "title": "Suma liczb parzystych", "language": "python", "kind": "function",
    "description": "Zwróć sumę liczb parzystych.",
    "solution": "def suma_parzystych(lista):\n    return sum(x for x in lista if x % 2 == 0)\n",
    "tests": [{"input": "suma_parzystych([1, 2])", "expected": "2"}],
}


def test_preview_ok(client):
    response = client.post("/api/import/preview", json={"text": json.dumps([TASK])})
    assert response.status_code == 200
    assert response.json()["items"][0]["status"] == "new"


def test_preview_bad_json(client):
    response = client.post("/api/import/preview", json={"text": "[{"})
    assert response.status_code == 422
    assert response.json()["detail"].startswith("Nieprawidłowy JSON")


def test_preview_too_large_bytes(client):                 # Review Focus 3: limit w bajtach UTF-8, nie w znakach
    response = client.post("/api/import/preview", json={"text": "ą" * 600_000})
    assert response.status_code == 413
    assert response.json()["detail"] == "Tekst jest za duży (najwyżej 1 MB)"


def test_import_creates(client):
    task = client.post("/api/import/preview", json={"text": json.dumps([TASK])}).json()["items"][0]["task"]
    response = client.post("/api/import", json={"tasks": [task]})
    assert response.status_code == 201
    assert response.json() == {"imported": 1, "skipped": 0,
                               "added": [{"title": TASK["title"], "language": "python"}]}
    assert client.get("/api/tasks").json()["total"] == 1


def test_import_validates(client):
    assert client.post("/api/import", json={"tasks": []}).status_code == 422
    no_solution = {**TASK, "difficulty": "easy"}
    del no_solution["solution"]
    assert client.post("/api/import", json={"tasks": [no_solution]}).status_code == 422


def test_import_blocked_cross_site(client):
    headers = {"Origin": "https://zla-strona.pl"}
    assert client.post("/api/import/preview", json={"text": "[]"}, headers=headers).status_code == 403
    assert client.post("/api/import", json={"tasks": [TASK]}, headers=headers).status_code == 403
