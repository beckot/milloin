import { expect, test } from "@playwright/test";

const ownerApiKey = process.env.MILLOIN_OWNER_API_KEY || "";
if (!ownerApiKey) throw new Error("MILLOIN_OWNER_API_KEY is required");

const ownerHeaders = {
  authorization: `Bearer ${ownerApiKey}`,
  "content-type": "application/json",
};

test("deployed mobile participant flow persists and edits availability", async ({ page, request }) => {
  let token = "";
  try {
    const createdResponse = await request.post("/api/v1/polls", {
      headers: ownerHeaders,
      data: {
        title: `Tuotantotesti ${Date.now()}`,
        timezone: "Europe/Helsinki",
        durationMinutes: 60,
      },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    token = created.publicToken;

    for (const slot of [
      { id: "slot-mobile-1", startsAtUtc: "2026-09-03T15:00:00.000Z" },
      { id: "slot-mobile-2", startsAtUtc: "2026-09-04T16:00:00.000Z" },
    ]) {
      const response = await request.post(`/api/v1/polls/${token}/slots`, {
        headers: ownerHeaders,
        data: slot,
      });
      expect(response.ok()).toBeTruthy();
    }

    await page.goto(`/p/${token}`);
    await expect(page.getByRole("heading")).toContainText("Tuotantotesti");
    await page.getByLabel("Nimi").fill("Mobiili Anna");
    const choices = page.getByRole("group", { name: /Saatavuus/ });
    await choices.nth(0).getByRole("button", { name: "Kyllä" }).click();
    await choices.nth(1).getByRole("button", { name: "Ei" }).click();
    await page.getByRole("button", { name: "Tallenna vastaukset" }).click();
    await expect(page.getByText("Vastauksesi on tallennettu")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Mobiili Anna")).toBeVisible();

    await page.getByRole("link", { name: "Tallenna tämä muokkauslinkki" }).click();
    await page.getByLabel("Nimi").fill("Mobiili Anna 2");
    const editChoices = page.getByRole("group", { name: /Saatavuus/ });
    await editChoices.nth(1).getByRole("button", { name: "Kyllä" }).click();
    await page.getByRole("button", { name: "Päivitä vastaukset" }).click();
    await expect(page.getByText("Vastaukset päivitetty")).toBeVisible();

    await page.goto(`/p/${token}`);
    await expect(page.getByText("Mobiili Anna 2")).toBeVisible();
  } finally {
    if (token) {
      await request.delete(`/api/v1/polls/${token}`, { headers: ownerHeaders }).catch(() => undefined);
    }
  }
});
