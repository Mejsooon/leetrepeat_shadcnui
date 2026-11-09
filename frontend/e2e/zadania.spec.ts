import { expect, test } from "@playwright/test"

test.describe.configure({ mode: "serial" })

test("dodaj, znajdź, edytuj i usuń zadanie", async ({ page }) => {
  const external: string[] = []
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:8000")) external.push(r.url())
  })

  // Pusta baza → ekran pierwszego uruchomienia
  await page.goto("/zadania")
  await page.getByRole("link", { name: "Dodaj pierwsze zadanie" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Dodaj zadanie" })).toBeVisible()

  await page.getByLabel("Tytuł zadania").fill("Odwracanie listy")
  await page.getByLabel("Dodaj tag").fill("Listy")
  await page.getByLabel("Dodaj tag").press("Enter")
  await page.getByLabel("Treść zadania").fill("Odwróć listę `l`.")
  await page.getByLabel("Wywołanie – test 1").fill("odwroc([1,2])")
  await page.getByLabel("Oczekiwany wynik (JSON) – test 1").fill("[2,1]")
  // Rozwiązanie w prawdziwym edytorze Monaco
  const solution = page.locator(".monaco-editor").nth(1)
  await expect(solution).toBeVisible()
  await solution.click()
  await page.keyboard.type("x = 1")
  await page.getByRole("button", { name: "Zapisz zadanie" }).click()

  // Lista z nowym zadaniem i licznik w panelu bocznym
  await expect(page).toHaveURL(/\/zadania$/)
  await expect(page.getByRole("link", { name: "Odwracanie listy", exact: true })).toBeVisible()
  await expect(page.getByText("Listy", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /Zadania/ }).locator("..")).toContainText("1")

  // Szukanie bez rozróżniania wielkości liter
  await page.getByLabel("Szukaj zadań").fill("ODWRAC")
  await expect(page).toHaveURL(/q=ODWRAC/)
  await expect(page.getByRole("link", { name: "Odwracanie listy", exact: true })).toBeVisible()
  await page.getByLabel("Szukaj zadań").fill("xyz")
  await expect(page.getByText("Brak zadań dla tych filtrów")).toBeVisible()
  await page.getByRole("button", { name: "Wyczyść filtry" }).click()

  // Edycja z ostrzeżeniem o niezapisanych zmianach
  await page.getByRole("link", { name: "Edytuj Odwracanie listy" }).click()
  await page.getByLabel("Tytuł zadania").fill("Odwracanie listy 2")
  await page.getByRole("link", { name: "Pulpit" }).click()
  await expect(page.getByText("Opuścić stronę?")).toBeVisible()
  await page.getByRole("button", { name: "Zostań" }).click()
  await page.getByRole("button", { name: "Zapisz zmiany" }).click()
  await expect(page.getByRole("link", { name: "Odwracanie listy 2", exact: true })).toBeVisible()

  // Usunięcie → znowu pusta biblioteka
  await page.getByRole("link", { name: "Edytuj Odwracanie listy 2" }).click()
  await page.getByRole("button", { name: "Usuń zadanie" }).click()
  await page.getByRole("button", { name: "Usuń", exact: true }).click()
  await expect(page.getByRole("link", { name: "Dodaj pierwsze zadanie" })).toBeVisible()

  expect(external).toEqual([])
})
