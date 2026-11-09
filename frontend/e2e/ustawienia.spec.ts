import { expect, test } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

// Serwer testowy działa w katalogu repozytorium z bazą e2e-test.db — kopie „przed przywróceniem” lądują obok niej
const REPO_ROOT = path.resolve(import.meta.dirname, "../..")

test.afterAll(() => {
  for (const name of fs.readdirSync(REPO_ROOT)) {
    if (name.startsWith("e2e-test.db.przed-przywroceniem-")) fs.rmSync(path.join(REPO_ROOT, name))
  }
})

test("ustawienia: limit, kopia zapasowa i przywrócenie", async ({ page }) => {
  await page.goto("/ustawienia")
  await expect(page.getByRole("heading", { level: 1, name: "Ustawienia" })).toBeVisible()
  await expect(page.getByText("Wykryto").first()).toBeVisible()

  // Limit Pythona zapisuje się i przetrwa przeładowanie
  const limit = page.getByLabel("Limit czasu Pythona")
  await limit.fill("7")
  await expect(page.getByText("Zmiany niezapisane")).toBeVisible()
  await page.getByRole("button", { name: "Zapisz" }).click()
  await expect(page.getByText("Zmiany niezapisane")).toBeHidden()
  await page.reload()
  await expect(page.getByLabel("Limit czasu Pythona")).toHaveValue("7")
  await page.getByLabel("Limit czasu Pythona").fill("5")
  await page.getByRole("button", { name: "Zapisz" }).click()
  await expect(page.getByText("Zmiany niezapisane")).toBeHidden()

  // Pobranie kopii
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("link", { name: "Pobierz kopię" }).click()
  const download = await downloadPromise
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  expect(download.suggestedFilename()).toBe(`leetrepeat-${iso}.db`)
  const copyPath = await download.path()

  // Przywrócenie tej kopii
  await page.getByLabel("Plik kopii bazy").setInputFiles({ name: "kopia.db", mimeType: "application/octet-stream", buffer: fs.readFileSync(copyPath) })
  await expect(page.getByText("Przywrócić bazę z pliku kopia.db?")).toBeVisible()
  await page.getByRole("button", { name: "Przywróć" }).click()
  await expect(page.getByText(/Przywrócono bazę/)).toBeVisible()
})
