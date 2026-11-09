import { expect, test } from "@playwright/test"

// Cała ścieżka na prawdziwym serwerze (spec §8): Pulpit → sesja → testy → ocena → Pulpit → Statystyki, w obu motywach

// Test biblioteki zakłada pustą bazę — usuwamy swoje zadania, także gdy test padnie
const createdIds: number[] = []
test.afterEach(async ({ request }) => {
  for (const id of createdIds.splice(0)) await request.delete(`/api/tasks/${id}`)
})

for (const theme of ["light", "dark"]) {
  test(`sesja z jednym zadaniem (motyw ${theme})`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem("leetrepeat-theme", value), theme)
    const created = await request.post("/api/tasks", {
      data: {
        title: `Suma ${theme}`, language: "python", kind: "function", difficulty: "easy",
        description: "Zwróć sumę `a + b`.", starter_code: "def add(a, b):\n    pass", hint: "", solution: "def add(a, b):\n    return a + b",
        tests: [{ input: "add(2, 3)", expected: "5" }], tags: [],
      },
    })
    const { id } = await created.json()
    createdIds.push(id)

    // Pulpit: jedno nowe zadanie = jeden krok
    await page.goto("/")
    await expect(page.getByText("1 mały krok. Wiedza na dłużej.")).toBeVisible()
    await page.getByRole("link", { name: "Zacznij powtórkę" }).click()
    await expect(page).toHaveURL(/\/sesja$/)
    await expect(page.getByRole("heading", { level: 1, name: `Suma ${theme}` })).toBeVisible()
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/)

    // Drugi (tylko do odczytu) edytor z rozwiązaniem nie może przejąć skrótu Ctrl+Enter
    await page.getByRole("button", { name: "Pokaż rozwiązanie" }).click()
    await expect(page.locator(".monaco-editor")).toHaveCount(2)

    // Kod w prawdziwym Monaco: zaznacz wszystko i wklej (insertText omija automatyczne wcięcia)
    const editor = page.locator(".monaco-editor").first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press("Control+A")
    await page.keyboard.insertText("def add(a, b):\n    return a + b")
    await page.keyboard.press("Control+Enter")
    await expect(page.getByText("Wszystkie testy przeszły")).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Przejdź do oceny" }).click()
    await expect(page.getByRole("heading", { name: "Rozwiązane. Jak Ci poszło?" })).toBeVisible()
    await page.keyboard.press("3")
    await expect(page.getByRole("radio", { name: "Dobre" })).toBeChecked()
    await page.getByRole("button", { name: "Zapisz ocenę i przejdź dalej" }).click()

    await expect(page.getByText("Sesja zakończona")).toBeVisible()
    await page.getByRole("button", { name: "Wróć na Pulpit" }).click()
    await expect(page).toHaveURL("http://127.0.0.1:8000/")
    await expect(page.getByText("Wszystko zrobione na dziś")).toBeVisible()
    await expect(page.getByText("Twoja seria trwa już 1 dzień.")).toBeVisible()

    // Statystyki widzą tę jedną ocenę
    await page.getByRole("link", { name: "Statystyki" }).click()
    const reviewsCard = page.locator("[data-slot=card]").filter({ hasText: "Wykonane powtórki" })
    await expect(reviewsCard.getByText("1", { exact: true })).toBeVisible()

    const saved = await (await request.get(`/api/tasks/${id}`)).json()
    expect(saved.status).toBe("learning")
    expect(saved.interval_days).toBe(3)
  })
}
