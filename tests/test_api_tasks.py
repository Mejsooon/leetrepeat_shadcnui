from datetime import date


def task(**changes):
    data = {
        "title": "Valid Parentheses", "language": "csharp", "kind": "function", "difficulty": "medium",
        "description": "Sprawdź nawiasy.", "starter_code": "", "hint": "Stos", "solution": "static bool V(string s) => true;",
        "tests": [{"input": "V(\"()\")", "expected": "true"}], "tags": ["Stos"],
    }
    data.update(changes)
    return data


def messages(response):
    return " ".join(e["msg"] for e in response.json()["detail"])


def test_create_get_roundtrip(client):
    r = client.post("/api/tasks", json=task())
    assert r.status_code == 201
    task_id = r.json()["id"]
    got = client.get(f"/api/tasks/{task_id}").json()
    assert got["title"] == "Valid Parentheses"
    assert got["tags"] == ["Stos"]
    assert got["tests"] == [{"input": "V(\"()\")", "expected": "true"}]
    assert got["status"] == "new"
    assert got["due_date"] == date.today().isoformat()


def test_special_characters_roundtrip(client):
    title = 'Cytat "x" & <y> 🎯'
    tests = [{"input": "linia1\nlinia2 \"z cudzysłowem\"", "expected": "ok\n"}]
    task_id = client.post("/api/tasks", json=task(title=title, kind="program", tests=tests)).json()["id"]
    got = client.get(f"/api/tasks/{task_id}").json()
    assert got["title"] == title and got["tests"] == tests


def test_whitespace_title_rejected(client):                         # Review Focus 4
    r = client.post("/api/tasks", json=task(title="   "))
    assert r.status_code == 422 and "Pole nie może być puste" in messages(r)


def test_no_tests_rejected(client):
    r = client.post("/api/tasks", json=task(tests=[]))
    assert r.status_code == 422 and "Dodaj co najmniej jeden test" in messages(r)


def test_empty_function_call_rejected(client):
    r = client.post("/api/tasks", json=task(tests=[{"input": " ", "expected": "1"}]))
    assert r.status_code == 422 and "Wywołanie funkcji nie może być puste" in messages(r)
    r = client.post("/api/tasks", json=task(kind="program", tests=[{"input": "", "expected": "1"}]))
    assert r.status_code == 201


def test_invalid_enum_rejected(client):
    assert client.post("/api/tasks", json=task(difficulty="super")).status_code == 422


def test_list_filters_via_query(client):
    client.post("/api/tasks", json=task())
    client.post("/api/tasks", json=task(title="Two Sum", language="python", difficulty="easy", tags=["Tablice"]))
    r = client.get("/api/tasks", params={"language": "csharp", "difficulty": "medium", "tag": "stos", "q": "nawias"})
    assert [i["title"] for i in r.json()["items"]] == ["Valid Parentheses"]
    assert r.json()["counts"]["library"] == 2


def test_page_beyond_range(client):                                 # Review Focus 2
    client.post("/api/tasks", json=task())
    r = client.get("/api/tasks", params={"page": 9})
    assert r.status_code == 200 and r.json()["items"] == [] and r.json()["pages"] == 1


def test_bad_paging_rejected(client):
    assert client.get("/api/tasks", params={"page": 0}).status_code == 422
    assert client.get("/api/tasks", params={"page_size": 500}).status_code == 422


def test_put_updates_and_404(client):
    task_id = client.post("/api/tasks", json=task()).json()["id"]
    r = client.put(f"/api/tasks/{task_id}", json=task(title="Nawiasy"))
    assert r.status_code == 200 and r.json() == {"id": task_id}
    assert client.get(f"/api/tasks/{task_id}").json()["title"] == "Nawiasy"
    r = client.put("/api/tasks/999", json=task())
    assert r.status_code == 404 and r.json()["detail"] == "Nie znaleziono zadania"


def test_patch_notes(client):
    task_id = client.post("/api/tasks", json=task()).json()["id"]
    assert client.patch(f"/api/tasks/{task_id}/notes", json={"notes": "Pamiętaj o stosie"}).json() == {"ok": True}
    assert client.get(f"/api/tasks/{task_id}").json()["notes"] == "Pamiętaj o stosie"
    assert client.patch("/api/tasks/999/notes", json={"notes": "x"}).status_code == 404


def test_delete_then_404(client):
    task_id = client.post("/api/tasks", json=task()).json()["id"]
    assert client.delete(f"/api/tasks/{task_id}").status_code == 204
    assert client.get(f"/api/tasks/{task_id}").status_code == 404
    assert client.delete(f"/api/tasks/{task_id}").status_code == 404


def test_tags_endpoint(client):
    client.post("/api/tasks", json=task())
    client.post("/api/tasks", json=task(title="B", tags=["stos", "Tablice"]))
    assert client.get("/api/tags").json() == [{"name": "Stos", "count": 2}, {"name": "Tablice", "count": 1}]
