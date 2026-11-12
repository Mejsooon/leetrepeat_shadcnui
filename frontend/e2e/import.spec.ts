import { expect, test } from "@playwright/test"

test.describe.configure({ mode: "serial" })

// Dwa poprawne zadania w Pythonie — rozwiązania sprawdza prawdziwy runner
const TASKS = [
  {
    title: "E2E import — suma", language: "python", kind: "function", description: "Zwróć sumę listy.",
    solution: "def suma(l):\n    return sum(l)\n",
    tests: [{ input: "suma([1, 2])", expected: "3" }, { input: "suma([])", expected: "0" }],
  },
  {
    title: "E2E import — długość", language: "python", kind: "function", description: "Zwróć długość napisu.",
    solution: "def dlugosc(s):\n    return len(s)\n",
    tests: [{ input: "dlugosc(\"kot\")", expected: "3" }],
  },
]

test.afterAll(async ({ request }) => {
  // Sprzątanie: usuń zaimportowane zadania, żeby nie wpływały na inne pliki e2e
  for (const task of TASKS) {
    const list = await (await request.get(`/api/tasks?q=${encodeURIComponent(task.title)}`)).json()
    for (const item of list.items) await request.delete(`/api/tasks/${item.id}`)
  }
})

test("import zadań z JSON: wklejenie → podgląd → import → biblioteka", async ({ page }) => {
  await page.goto("/zadania")
  await page.getByRole("button", { name: "Importuj" }).click()
  await page.getByLabel("JSON z zadaniami").fill("```json\n" + JSON.stringify(TASKS, null, 2) + "\n```")
  await page.getByRole("button", { name: "Sprawdź" }).click()

  await expect(page.getByText("Znaleziono 2 zadania. Zaznacz te, które chcesz dodać do biblioteki.")).toBeVisible()
  const importButton = page.getByRole("button", { name: "Importuj 2 zadania" })
  await expect(importButton).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByText("Rozwiązanie przechodzi testy")).toHaveCount(2)
  await importButton.click()

  await expect(page.getByText("Zaimportowano 2 zadania")).toBeVisible()
  await page.getByRole("button", { name: "Zamknij" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  for (const task of TASKS) await expect(page.getByRole("link", { name: task.title, exact: true })).toBeVisible()
})
