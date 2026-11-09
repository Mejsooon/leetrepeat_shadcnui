import { defineConfig } from "@playwright/test"

// Test całości: prawdziwy serwer (python main.py) + zbudowany frontend z dist.
// PW_CHROME = ścieżka do zainstalowanego Chrome, gdy nie da się pobrać przeglądarki Playwright.
const python = process.env.PYTHON ?? (process.platform === "win32" ? "py" : "python3")

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:8000",
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  webServer: {
    // Za każdym razem świeża baza testowa
    command: `${python} -c "import os; os.path.exists('e2e-test.db') and os.remove('e2e-test.db')" && ${python} main.py`,
    cwd: "..",
    url: "http://127.0.0.1:8000/api/health",
    env: { LEETREPEAT_DB: "e2e-test.db" },
    reuseExistingServer: false,
  },
})
