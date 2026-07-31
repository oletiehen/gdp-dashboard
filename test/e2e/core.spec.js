import { expect, test } from "@playwright/test";

async function unlock(page) {
  await page.goto("/");
  if (await page.locator("#appShell").isVisible()) return;
  if (!(await page.locator("#accessCode").isVisible())) await page.locator("#codeFallback summary").click();
  await page.locator("#accessCode").fill("synthetic-access-code");
  await page.getByRole("button", { name: "Einmalig mit Code öffnen" }).click();
  await expect(page.locator("#appShell")).toBeVisible();
}

test.describe.serial("geschützter Reha-Kompass", () => {
  test("passkey setup, secure sign-out, passwordless return and revocation work", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true
      }
    });
    await unlock(page);
    await page.goto("/#/mehr");
    await page.getByRole("button", { name: "Zugang", exact: true }).click();
    await page.locator("#passkeyDeviceName").fill("Synthetisches persönliches Gerät");
    await page.getByRole("button", { name: "Passkey für dieses Gerät einrichten" }).click();
    await expect(page.locator("#passkeyRegisterStatus")).toContainText("erfolgreich bestätigt");
    await expect(page.locator("#deviceList")).toContainText("Synthetisches persönliches Gerät");

    await page.getByRole("button", { name: "Sicher abmelden", exact: true }).first().click();
    await expect(page.locator("#lockScreen")).toBeVisible();
    await page.getByRole("button", { name: "Mit Face ID, Touch ID oder Gerätecode fortfahren" }).click();
    await expect(page.locator("#appShell")).toBeVisible();
    await page.reload();
    await expect(page.locator("#appShell")).toBeVisible();

    await page.goto("/#/mehr");
    await page.getByRole("button", { name: "Zugang", exact: true }).click();
    await page.getByRole("button", { name: "Abmelden und entziehen" }).click();
    await page.getByRole("button", { name: "Ja, durchführen" }).click();
    await expect(page.locator("#lockScreen")).toBeVisible();
    await expect(page.locator("#passkeyLogin")).toBeHidden();
  });

  test("new user sees a guided cockpit without a long dashboard", async ({ page }) => {
    await unlock(page);
    await expect(page.locator(".next-card")).toBeVisible();
    await expect(page.locator(".quick-tiles .tile")).toHaveCount(4);
    await expect(page.getByText("Dein nächster sinnvoller Schritt")).toBeVisible();
  });

  test("expected and confirmed admission dates remain distinct", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/kalender");
    await page.locator("#admissionDate").fill("2030-06-10");
    await page.locator("#admissionStatus").selectOption("expected");
    await page.locator("#admissionSource").fill("Synthetische Terminannahme");
    await page.getByRole("button", { name: "Zeitachse aktualisieren" }).click();
    await expect(page.getByText("Vorläufig – nicht bestätigt").first()).toBeVisible();
    await page.locator("#admissionStatus").selectOption("confirmed");
    await page.locator("#admissionSource").fill("Synthetische Bestätigung");
    await page.getByRole("button", { name: "Zeitachse aktualisieren" }).click();
    await expect(page.getByText("Aus bestätigtem Datum berechnet").first()).toBeVisible();
    await page.goto("/#/listen");
    await page.locator("#taskGroup").selectOption("Stabilisierung");
    await expect(page.locator("#taskList").getByText("Die letzten 14 Tage bewusst ruhig und verlässlich planen")).toBeVisible();
  });

  test("personal lists are filtered and contain no employer task", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/listen");
    await page.locator("#taskGroup").selectOption("Organisation");
    await expect(page.locator("#taskList").getByText("Tierbetreuung für den Testzeitraum klären")).toBeVisible();
    await expect(page.getByText(/Arbeitgeber informieren/i)).toHaveCount(0);
  });

  test("personal profile, weight entry and goals are editable", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/mehr");
    await expect(page.locator("#profileDisplayName")).toHaveValue("Testperson");
    await expect(page.locator("#profileWeightCurrent")).toHaveValue("70");
    await page.locator("#weightEntryValue").fill("71.2");
    await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
    await expect(page.getByText("71,2 kg")).toBeVisible();
    await page.locator("#goalTitle").fill("Synthetisches persönliches Ziel");
    await page.getByRole("button", { name: "Ziel ergänzen" }).click();
    await expect(page.getByText("Synthetisches persönliches Ziel", { exact: true })).toBeVisible();
  });

  test("therapy-plan extraction stays editable until explicit confirmation", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/dokumente");
    await page.locator("#planFile").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    });
    await page.getByRole("button", { name: "Dokument analysieren" }).click();
    const title = page.locator('[data-scan-field="title"]');
    await expect(title).toHaveValue("Testgruppe");
    await title.fill("Korrigierter Testtermin");
    await page.getByRole("button", { name: "Kontrollierte Einträge übernehmen" }).click();
    await expect(page).toHaveURL(/#\/kalender/);
    await page.locator("#calendarDate").fill("2030-06-03");
    await page.locator("#calendarDate").dispatchEvent("change");
    await expect(page.getByText("Korrigierter Testtermin")).toBeVisible();
  });

  test("AI 429 keeps the input and the offline core usable", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/coach");
    await page.locator("#assistantMessage").fill("[TEST_429]");
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await expect(page.locator("#assistantMessage")).toHaveValue("[TEST_429]");
    await expect(page.getByText(/Offline-Hilfe:/)).toBeVisible();
    await page.goto("/#/listen");
    await expect(page.getByRole("heading", { name: "Persönliche Checklisten" })).toBeVisible();
  });

  test("voice recording cannot start without explicit consent", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/tagebuch");
    await page.getByRole("button", { name: "● Sprachnotiz" }).click();
    await page.getByRole("button", { name: "Aufnahme starten" }).click();
    await expect(page.locator("#voiceIndicator")).toHaveText("Nicht aktiv");
    await expect(page.locator("#toast")).toContainText("ausdrücklich");
  });

  test("audio, transcript and summary can be managed and deleted separately", async ({ page, context }) => {
    await context.grantPermissions(["microphone"], { origin: "http://localhost:4173" });
    await unlock(page);
    await page.goto("/#/tagebuch");
    await page.getByRole("button", { name: "● Sprachnotiz" }).click();
    await page.locator("#voiceConsent").check();
    await page.getByRole("button", { name: "Aufnahme starten" }).click();
    await expect(page.locator("#voiceIndicator")).toContainText("Aufnahme läuft");
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Beenden" }).click();
    await expect(page.locator("#voiceIndicator")).toContainText("Aufnahme beendet");
    await page.locator("#voiceTranscript").fill("Synthetisches Transkript");
    await page.locator("#voiceSummary").fill("Synthetische Zusammenfassung");
    await page.getByRole("button", { name: "Getrennt speichern" }).click();
    await expect(page.locator("#voiceDialog")).not.toBeVisible();
    const history = page.locator("#journalHistory");
    const newest = history.locator(".entry-card").first();
    await expect(newest.getByRole("button", { name: "Audio löschen" })).toBeVisible();
    await newest.getByRole("button", { name: "Audio löschen" }).click();
    await newest.getByRole("button", { name: "Transkript löschen" }).click();
    await newest.getByRole("button", { name: "Zusammenfassung löschen" }).click();
    await expect(newest.getByRole("button", { name: "Audio löschen" })).toHaveCount(0);
    await expect(newest.getByRole("button", { name: "Transkript löschen" })).toHaveCount(0);
    await expect(newest.getByRole("button", { name: "Zusammenfassung löschen" })).toHaveCount(0);
  });

  test("encrypted archive supports upload, local preview, export and deletion", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/dokumente");
    await page.locator("#archiveFile").setInputFiles({
      name: "synthetisch.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetischer, nicht personenbezogener Testinhalt", "utf8")
    });
    await page.locator("#archiveName").fill("Synthetisches Dokument");
    await page.getByRole("button", { name: "Verschlüsselt speichern" }).click();
    await expect(page.getByText("Synthetisches Dokument", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Synthetisches Dokument ansehen" }).click();
    await expect(page.getByText("Synthetischer, nicht personenbezogener Testinhalt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Vorschau schließen" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Synthetisches Dokument herunterladen" }).click();
    await download;
    await page.getByRole("button", { name: "Synthetisches Dokument löschen" }).click();
    await page.getByRole("button", { name: "Ja, durchführen" }).click();
    await expect(page.locator("#documentList").getByText("Synthetisches Dokument", { exact: true })).toHaveCount(0);
  });

  test("offline shell remains locked after restart and can be opened only with the code fallback", async ({ page, context }) => {
    await unlock(page);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
    if (!(await page.locator("#accessCode").isVisible())) await page.locator("#codeFallback summary").click();
    await page.locator("#accessCode").fill("synthetic-access-code");
    await page.getByRole("button", { name: "Einmalig mit Code öffnen" }).click();
    await expect(page.locator("#appShell")).toBeVisible();
    await context.setOffline(true);
    await page.goto("/#/listen");
    await expect(page.getByRole("heading", { name: "Persönliche Checklisten" })).toBeVisible();
    await page.reload();
    await expect(page.locator("#lockScreen")).toBeVisible();
    if (!(await page.locator("#accessCode").isVisible())) await page.locator("#codeFallback summary").click();
    await page.locator("#accessCode").fill("synthetic-access-code");
    await page.getByRole("button", { name: "Einmalig mit Code öffnen" }).click();
    await expect(page.locator("#appShell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Persönliche Checklisten" })).toBeVisible();
    await expect(page.locator("#offlineBanner")).toBeVisible();
    await context.setOffline(false);
  });

  test("backup export and controlled data deletion remain functional", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/mehr");
    await page.getByRole("button", { name: "Daten", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Verschlüsselte Sicherung" }).click();
    const backup = await download;
    expect(backup.suggestedFilename()).toMatch(/^rehakompass-verschluesselt-/);
    await page.getByRole("button", { name: "Löschung prüfen" }).click();
    await page.getByRole("button", { name: "Ja, durchführen" }).click();
    await expect(page.locator("#lockScreen")).toBeVisible();
  });
});
