import shutil

import pytest

from backend.services import runner
from backend.services.runner import RuntimeMissing, run_tests

needs_dotnet = pytest.mark.skipif(shutil.which("dotnet") is None, reason="brak dotnet")

REV = "static int[] Odwroc(int[] a) { var r = (int[])a.Clone(); Array.Reverse(r); return r; }"


@needs_dotnet
def test_function_pass():
    r = run_tests("csharp", "function", REV, [{"input": "Odwroc(new[]{1,2,3})", "expected": "[3,2,1]"}])
    assert r[0]["status"] == "pass"


@needs_dotnet
def test_function_fail():
    r = run_tests("csharp", "function", REV, [{"input": "Odwroc(new[]{1,2})", "expected": "[1,2]"}])
    assert r[0]["status"] == "fail" and r[0]["actual"] == "[2,1]"


@needs_dotnet
def test_function_static_class_and_using():
    code = "using System.Linq;\nstatic class S { public static int Suma(int[] a) => a.Sum(); }"
    r = run_tests("csharp", "function", code, [{"input": "S.Suma(new[]{1,2,3})", "expected": "6"}])
    assert r[0]["status"] == "pass"


@needs_dotnet
def test_function_exception():
    code = "static int Dziel(int a, int b) => a / b;"
    r = run_tests("csharp", "function", code, [{"input": "Dziel(1, 0)", "expected": "0"}])
    assert r[0]["status"] == "error" and "DivideByZeroException" in r[0]["message"]


@needs_dotnet
def test_compile_error_all_error():
    r = run_tests("csharp", "function", "static int X( { }", [{"input": "X()", "expected": "1"}] * 2)
    assert [t["status"] for t in r] == ["error", "error"] and "CS" in r[0]["message"]


@needs_dotnet
def test_program_pass_polish():                      # Review Focus 1
    code = "var x = Console.ReadLine();\nConsole.WriteLine(x + \" gęś\");"
    r = run_tests("csharp", "program", code, [{"input": "zażółć", "expected": "zażółć gęś"}])
    assert r[0]["status"] == "pass"


@needs_dotnet
def test_program_two_tests():
    code = "int x = int.Parse(Console.ReadLine());\nConsole.WriteLine(x * 2);"
    r = run_tests("csharp", "program", code, [{"input": "4", "expected": "8"}, {"input": "5", "expected": "11"}])
    assert [t["status"] for t in r] == ["pass", "fail"]


def test_missing_dotnet_raises(monkeypatch):
    monkeypatch.setattr(runner.shutil, "which", lambda _: None)
    with pytest.raises(RuntimeMissing):
        run_tests("csharp", "program", "", [{"input": "", "expected": ""}])


@needs_dotnet
def test_timeout_kills_compiled_program():              # przegląd: Critical 1
    marker = "petla_do_ubicia_12345"
    code = f'var s = "{marker}";\nwhile (true) {{ }}'
    r = run_tests("csharp", "program", code, [{"input": "", "expected": ""}], timeout_s=8)
    assert r[0]["status"] == "timeout"
    import subprocess, time
    time.sleep(0.5)
    alive = subprocess.run(["pgrep", "-f", "runfile/main"], capture_output=True, text=True).stdout.strip()
    assert alive == ""


@needs_dotnet
def test_debug_write_without_newline():                 # przegląd: Important 1
    code = 'static int F() { Console.Write("dbg"); return 5; }'
    r = run_tests("csharp", "function", code, [{"input": "F()", "expected": "5"}, {"input": "F()", "expected": "5"}])
    assert [t["status"] for t in r] == ["pass", "pass"]


@needs_dotnet
def test_compile_error_points_to_user_line():           # przegląd: numery linii
    code = "using System.Linq;\nstatic int X() { return \"a\"; }"
    r = run_tests("csharp", "function", code, [{"input": "X()", "expected": "1"}])
    assert "main.cs(2," in r[0]["message"]
    r = run_tests("csharp", "program", "int x = \"a\";", [{"input": "", "expected": ""}])
    assert "main.cs(1," in r[0]["message"]


@needs_dotnet
def test_polish_result_not_escaped():                   # przegląd: \u017C w wynikach
    code = 'static string F() => "zażółć";'
    r = run_tests("csharp", "function", code, [{"input": "F()", "expected": "\"x\""}])
    assert r[0]["status"] == "fail" and r[0]["actual"] == '"zażółć"'


def test_missing_dotnet_path_raises():
    with pytest.raises(RuntimeMissing):
        run_tests("csharp", "function", "static int F() => 1;", [{"input": "F()", "expected": "1"}],
                  dotnet_path="/nie/ma/dotnet")
