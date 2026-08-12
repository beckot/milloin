import { test, expect } from "@playwright/test";
import { createOwnerSession } from "../src/auth/session";

const baseURL = "http://127.0.0.1:3000";
const secret = "0123456789abcdef0123456789abcdef";

test("organizer creates poll, participant votes, edits, finalizes, and deletes", async ({ context, page }) => {
  const session = await createOwnerSession(
    { sub: "google-test", email: "otto@example.com", name: "Otto" },
    secret,
  );
  await context.addCookies([{ name: "milloin_session", value: session, url: baseURL }]);

  await page.goto("/new");
  await page.getByLabel("Otsikko").fill("Saunailta");
  await page.getByLabel("Päivä 1").fill("2026-08-20");
  await page.getByLabel("Aika 1").fill("18:00");
  await page.getByRole("button", { name: "Lisää aika" }).click();
  await page.getByLabel("Päivä 2").fill("2026-08-21");
  await page.getByLabel("Aika 2").fill("19:00");
  await page.getByRole("button", { name: "Luo kysely" }).click();

  await expect(page).toHaveURL(/\/p\/.+\/admin$/);
  const adminUrl = page.url();
  const publicUrl = adminUrl.replace(/\/admin$/, "");

  await page.goto(publicUrl);
  await page.getByLabel("Nimi").fill("Anna");
  let choices = page.getByRole("group", { name: /Saatavuus/ });
  await choices.nth(0).getByRole("button", { name: "Kyllä" }).click();
  await choices.nth(1).getByRole("button", { name: "Ei" }).click();
  await page.getByRole("button", { name: "Tallenna vastaukset" }).click();
  await expect(page.getByText("Vastauksesi on tallennettu")).toBeVisible();
  await expect(page.getByText("Anna")).toBeVisible();

  await page.getByRole("link", { name: "Tallenna tämä muokkauslinkki" }).click();
  await expect(page).toHaveURL(/\/edit\//);
  await page.getByLabel("Nimi").fill("Anna 2");
  choices = page.getByRole("group", { name: /Saatavuus/ });
  await choices.nth(1).getByRole("button", { name: "Kyllä" }).click();
  await page.getByRole("button", { name: "Päivitä vastaukset" }).click();
  await expect(page.getByText("Vastaukset päivitetty")).toBeVisible();

  await page.goto(adminUrl);
  await expect(page.getByText("Anna 2")).toBeVisible();
  await page.getByRole("button", { name: /Valitse voittajaksi/ }).first().click();
  await expect(page.getByText("Kysely suljettu")).toBeVisible();

  await page.goto(publicUrl);
  await expect(page.getByText("Kysely on suljettu")).toBeVisible();

  await page.goto(adminUrl);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Poista kysely" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole("heading", { name: "Sovitaan aika ilman säätöä." })).toBeVisible();
});
