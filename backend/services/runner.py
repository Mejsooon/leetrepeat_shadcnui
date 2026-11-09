"""Uruchamianie kodu użytkownika i porównanie z testami (przeniesione z LeetRepeat v2)."""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile

PYTHON_TIME_LIMIT = 5        # domyślny limit (sekundy na jeden proces)
CSHARP_TIME_LIMIT = 20       # obejmuje kompilację C#

# Linia "using X;" / "using static X;" / "using A = B;" — w C# musi stać na samej górze pliku
USING_LINE = re.compile(r"^\s*(global\s+)?using\s+(static\s+)?[\w.]+(\s*=\s*[\w.<>,\s]+)?\s*;\s*$")


class RuntimeMissing(Exception):
    """Brak interpretera / SDK na komputerze — komunikat po polsku dla użytkownika."""


def run_tests(language: str, kind: str, code: str, tests: list[dict],
              python_path: str | None = None, dotnet_path: str = "dotnet",
              timeout_s: float | None = None) -> list[dict]:
    # --- 1. Jaki program uruchamia kod i z jakim limitem czasu ---
    # Ścieżki i limity przychodzą z Ustawień; bez nich: Python, który uruchomił serwer, i "dotnet" z PATH
    if language == "python":
        program = python_path or sys.executable
        if not program or shutil.which(program) is None:
            raise RuntimeMissing(f"Nie znaleziono Pythona: {program}")
        file_name = "main.py"
        command = [program, file_name]
        time_limit = timeout_s or PYTHON_TIME_LIMIT
    elif language == "csharp":
        if shutil.which(dotnet_path) is None:
            raise RuntimeMissing(f"Nie znaleziono dotnet: {dotnet_path} — zainstaluj .NET 10 SDK (instrukcja w README)")
        file_name = "main.cs"
        command = [dotnet_path, "run", file_name]
        time_limit = timeout_s or CSHARP_TIME_LIMIT
    else:
        raise ValueError(f"Nieznany język: {language}")

    # DOTNET_CLI_UI_LANGUAGE=en: komunikaty kompilatora po angielsku (polskie Windows pisze je
    # w kodowaniu konsoli, nie w UTF-8)
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
           "DOTNET_NOLOGO": "1", "DOTNET_CLI_UI_LANGUAGE": "en"}
    results = []

    # Normalizacja tekstu wyjścia: \r\n -> \n, bez spacji na końcach linii i pustych linii na końcu
    def normalize(text):
        lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
        while lines and lines[-1] == "":
            lines.pop()
        return "\n".join(lines)

    # Treść błędu procesu: dla C# linie "error CS..." (błędy kompilacji), inaczej końcówka stderr
    def error_text(stdout, stderr):
        compile_errors = [line.strip() for line in (stdout + "\n" + stderr).splitlines() if "error CS" in line]
        if compile_errors:
            return "\n".join(dict.fromkeys(compile_errors))   # bez powtórzeń
        return "\n".join(stderr.strip().splitlines()[-5:]) or "Program zakończył się błędem"

    # Uruchamia program; przy przekroczeniu czasu zabija CAŁE drzewo procesów
    # (dotnet run startuje skompilowany program jako osobny proces — samo zabicie dotnet go nie zatrzyma).
    # Zwraca (kod_wyjścia, stdout, stderr) albo None przy przekroczeniu czasu.
    def run_process(stdin_text, cwd):
        extra = {"start_new_session": True} if os.name != "nt" else {}
        proc = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
                                env=env, **extra)
        try:
            stdout, stderr = proc.communicate(stdin_text, timeout=time_limit)
            return proc.returncode, stdout, stderr
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
            else:
                os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            return None

    # C#: linie using przenosimy na górę pliku, a w ich miejscu zostawiamy puste linie,
    # żeby numery linii w błędach kompilacji zgadzały się z kodem w edytorze (#line 1)
    if language == "csharp":
        code_lines = code.splitlines()
        usings = "\n".join(line for line in code_lines if USING_LINE.match(line))
        code = "#line 1\n" + "\n".join("" if USING_LINE.match(line) else line for line in code_lines)
        # PublishAot=false: zwykła kompilacja (z AOT nie działa JsonSerializer i potrzebne są paczki NuGet)
        # Nullable=disable + WarningLevel=0: ostrzeżenia kompilatora nie trafiają do wyjścia programu
        csharp_header = ("#:property PublishAot=false\n#:property Nullable=disable\n#:property WarningLevel=0\n"
                         + usings + "\n")

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, file_name)
        if language == "csharp":
            # Pusta lista źródeł NuGet: kompilacja działa offline, bez łączenia się z nuget.org
            with open(os.path.join(tmp, "nuget.config"), "w", encoding="utf-8") as f:
                f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                        "<configuration><packageSources><clear /></packageSources></configuration>\n")

        if kind == "function":
            # --- 2a. Harness: kod użytkownika + wywołanie każdego testu z prefiksem @@numer ---
            # Każda linia @@ zaczyna się od \n, więc print/Write bez końca linii jej nie "skleja".
            # Wejście testu stoi w osobnej linii, więc komentarz // w nim nie psuje reszty.
            if language == "csharp":
                source = (csharp_header + "using System.Text.Json;\n"
                          "Console.OutputEncoding = System.Text.Encoding.UTF8;\n")
                for i, test in enumerate(tests):
                    source += (
                        "try { var __r = (\n"
                        f"{test['input']}\n"
                        f'); Console.WriteLine("\\n@@{i} OK " + JsonSerializer.Serialize(__r)); }}\n'
                        f'catch (Exception __e) {{ Console.WriteLine("\\n@@{i} ERR " + __e.GetType().Name + ": " + __e.Message); }}\n'
                    )
                source += code + "\n"
            else:
                source = code + "\n\nimport json as __json\n"
                for i, test in enumerate(tests):
                    source += (
                        "try:\n"
                        f"    __r = {test['input']}\n"
                        f"    print('\\n@@{i} OK ' + __json.dumps(__r, separators=(',', ':'), ensure_ascii=False))\n"
                        "except Exception as __e:\n"
                        f"    print('\\n@@{i} ERR ' + type(__e).__name__ + ': ' + str(__e))\n"
                    )
            with open(path, "w", encoding="utf-8") as f:
                f.write(source)

            # --- 3a. Jeden proces na wszystkie testy ---
            outcome = run_process("", tmp)
            if outcome is None:
                for test in tests:
                    results.append({"status": "timeout", "input": test["input"], "expected": test["expected"],
                                    "actual": None, "message": f"Kod działał dłużej niż {time_limit} s"})
                return results
            returncode, stdout, stderr = outcome

            # Zbieramy linie "@@i OK <json>" / "@@i ERR <komunikat>"; reszta stdout (debug print) jest ignorowana
            answers = {}
            for line in stdout.splitlines():
                if not line.startswith("@@"):
                    continue
                number, status, rest = (line[2:].split(" ", 2) + ["", ""])[:3]
                answers[number] = (status, rest)
            if returncode == 0:
                crash_message = "Brak wyniku tego testu (czy program nie zakończył się wcześniej, np. przez exit()?)"
            else:
                crash_message = error_text(stdout, stderr)

            # --- 4a. Porównanie każdego testu ---
            for i, test in enumerate(tests):
                result = {"status": "error", "input": test["input"], "expected": test["expected"],
                          "actual": None, "message": None}
                if str(i) not in answers:
                    result["message"] = crash_message
                    results.append(result)
                    continue
                status, rest = answers[str(i)]
                if status != "OK":
                    result["message"] = rest
                    results.append(result)
                    continue
                try:
                    actual_value = json.loads(rest)
                except json.JSONDecodeError:
                    result["message"] = "Nieczytelny wynik testu: " + rest
                    results.append(result)
                    continue
                # Wynik pokazujemy z polskimi znakami (C# zapisuje je jako \u017C)
                result["actual"] = json.dumps(actual_value, separators=(",", ":"), ensure_ascii=False)
                try:
                    expected_value = json.loads(test["expected"])
                except json.JSONDecodeError:
                    result["message"] = "Niepoprawny JSON w polu expected"
                    results.append(result)
                    continue
                result["status"] = "pass" if actual_value == expected_value else "fail"
                results.append(result)
            return results

        # --- 2b. Program: kod bez zmian, osobny proces na każdy test, input na stdin ---
        with open(path, "w", encoding="utf-8") as f:
            if language == "csharp":
                f.write(csharp_header + "Console.OutputEncoding = System.Text.Encoding.UTF8;\n"
                        "Console.InputEncoding = System.Text.Encoding.UTF8;\n" + code + "\n")
            else:
                f.write(code)
        for test in tests:
            result = {"status": "error", "input": test["input"], "expected": test["expected"],
                      "actual": None, "message": None}
            outcome = run_process(test["input"], tmp)
            if outcome is None:
                result["status"] = "timeout"
                result["message"] = f"Kod działał dłużej niż {time_limit} s"
                results.append(result)
                continue
            returncode, stdout, stderr = outcome
            result["actual"] = normalize(stdout)
            if returncode != 0:
                result["message"] = error_text(stdout, stderr)
            elif result["actual"] == normalize(test["expected"]):
                result["status"] = "pass"
            else:
                result["status"] = "fail"
            results.append(result)
        return results
