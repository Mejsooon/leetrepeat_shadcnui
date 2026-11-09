import pytest

from backend.services.runner import RuntimeMissing, run_tests

REV = "def odwroc(l):\n    return l[::-1]\n"


def test_function_pass_and_json_spacing():
    r = run_tests("python", "function", REV, [{"input": "odwroc([1,2,3])", "expected": "[3, 2, 1]"}])
    assert r[0]["status"] == "pass"


def test_function_fail_shows_actual():
    r = run_tests("python", "function", REV, [{"input": "odwroc([1,2])", "expected": "[1,2]"}])
    assert r[0]["status"] == "fail" and r[0]["actual"] == "[2,1]"


def test_function_exception_is_error_per_test():
    code = REV + "def boom():\n    raise ValueError('x')\n"
    r = run_tests("python", "function", code, [
        {"input": "boom()", "expected": "1"}, {"input": "odwroc([1])", "expected": "[1]"}])
    assert r[0]["status"] == "error" and "ValueError" in r[0]["message"]
    assert r[1]["status"] == "pass"


def test_syntax_error_marks_all_error():
    r = run_tests("python", "function", "def x(:\n", [{"input": "x()", "expected": "1"}] * 2)
    assert [t["status"] for t in r] == ["error", "error"]


def test_debug_print_ignored():                      # Review Focus 3
    code = "def f():\n    print('debug')\n    return 5\n"
    assert run_tests("python", "function", code, [{"input": "f()", "expected": "5"}])[0]["status"] == "pass"


def test_bad_expected_json():
    r = run_tests("python", "function", REV, [{"input": "odwroc([])", "expected": "nie json"}])
    assert r[0]["status"] == "error"


def test_program_pass_with_trailing_whitespace():
    code = "x = int(input())\nprint(x * 2, ' ')\nprint()\n"
    r = run_tests("python", "program", code, [{"input": "4", "expected": "8"}])
    assert r[0]["status"] == "pass"


def test_program_crlf_expected():
    r = run_tests("python", "program", "print('a')\nprint('b')\n", [{"input": "", "expected": "a\r\nb\r\n"}])
    assert r[0]["status"] == "pass"


def test_program_polish_chars():                     # Review Focus 1
    r = run_tests("python", "program", "print(input() + ' gęś')\n", [{"input": "zażółć", "expected": "zażółć gęś"}])
    assert r[0]["status"] == "pass"


def test_program_reads_too_much_input():             # Review Focus 2
    r = run_tests("python", "program", "input()\ninput()\n", [{"input": "1", "expected": ""}])
    assert r[0]["status"] == "error" and "EOFError" in r[0]["message"]


def test_timeout():
    r = run_tests("python", "program", "while True:\n    pass\n", [{"input": "", "expected": ""}])
    assert r[0]["status"] == "timeout"


def test_debug_print_without_newline():              # przegląd: Important 1
    code = "def f():\n    print('dbg', end='')\n    return 5\n"
    r = run_tests("python", "function", code, [{"input": "f()", "expected": "5"}, {"input": "f()", "expected": "5"}])
    assert [t["status"] for t in r] == ["pass", "pass"]


def test_non_utf8_output_does_not_crash():           # przegląd: Important 2
    code = "import sys\nsys.stdout.buffer.write(b'\\xff\\xfe')\nsys.stderr.buffer.write(b'\\xa5')\n"
    r = run_tests("python", "program", code, [{"input": "", "expected": "x"}])
    assert r[0]["status"] == "fail"


def test_fake_marker_line_does_not_crash():          # przegląd: @@ w wyjściu użytkownika
    code = "def f():\n    print('@@0 OK abc')\n    return 1\n"
    r = run_tests("python", "function", code, [{"input": "f()", "expected": "1"}])
    assert r[0]["status"] in ("pass", "error")


def test_custom_timeout_is_used():
    import time
    start = time.monotonic()
    r = run_tests("python", "program", "while True: pass\n", [{"input": "", "expected": ""}], timeout_s=1)
    assert r[0]["status"] == "timeout"
    assert time.monotonic() - start < 4          # limit 1 s, nie domyślne 5 s


def test_missing_python_path_raises():
    with pytest.raises(RuntimeMissing):
        run_tests("python", "function", "def f(): return 1\n", [{"input": "f()", "expected": "1"}],
                  python_path="/nie/ma/takiego/pythona")
