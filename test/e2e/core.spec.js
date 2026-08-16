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
    await expect(page.locator(".quick-tiles .tile")).toHaveCount(6);
    await expect(page.getByRole("link", { name: /Freizeit & Umgebung/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Entzug & Reha/ }).first()).toBeVisible();
    await expect(page.getByText("Dein nächster sinnvoller Schritt")).toBeVisible();
  });

  test("withdrawal and rehab journey is understandable, editable and transparent about its source", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/entzug");
    await expect(page.getByRole("heading", { name: "Entzug & direkter Übergang in die Reha" })).toBeVisible();
    await expect(page.locator("#journeyStatusTitle")).toContainText("30 Tage");
    await expect(page.locator("#journeyWard")).toHaveText("Synthetische Privatstation A");
    await expect(page.locator("#journeyWardBasis")).toContainText("öffentlich nicht separat dokumentiert");
    await expect(page.locator("#careJourneyTimeline")).toContainText("Direkter Übergang in die Reha");
    await page.locator("#withdrawalDate").fill("2030-05-10");
    await page.locator("#withdrawalSource").fill("Synthetisch verschoben");
    await page.getByRole("button", { name: "Plan verschlüsselt speichern" }).click();
    await expect(page.locator("#journeyStatusTitle")).toContainText("31 Tage");
  });

  test("local guide provides websites, Google Maps, a private compass and calendar planning", async ({ page, context }) => {
    await unlock(page);
    await page.goto("/#/freizeit");
    await expect(page.getByRole("heading", { name: "Freizeit & Umgebung" })).toBeVisible();
    await expect(page.getByText("ca. 32 km", { exact: true })).toBeVisible();
    const aldi = page.locator(".guide-card", { hasText: "ALDI Nord" });
    await expect(aldi.locator("img")).toHaveAttribute("src", /staticmap\.openstreetmap\.de/);
    await expect(aldi.getByRole("link", { name: "Google Maps ↗", exact: true })).toHaveAttribute("href", /google\.com\/maps\/dir/);
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 52.5143, longitude: 8.0685 });
    await page.getByRole("button", { name: "Meinen Standort verwenden" }).click();
    await expect(page.locator("#guideLocationStatus")).toContainText("Standort auf diesem Gerät aktiv");
    await expect(page.locator("#guideCompass")).toContainText("Dein Standort");
    await page.locator("#guideEnergy").selectOption("aktiv");
    await page.getByRole("button", { name: "Alltag", exact: true }).click();
    await expect(page.getByText("Die Auswahl ist gerade zu eng.")).toBeVisible();
    await page.getByRole("button", { name: "Alle zeigen" }).click();
    const naturbad = page.locator(".guide-card", { hasText: "Naturbad Vörden" });
    await expect(naturbad).toBeVisible();
    await naturbad.getByRole("button", { name: "Einplanen" }).click();
    await expect(page.getByRole("heading", { name: "Freizeit einplanen" })).toBeVisible();
    await expect(page.locator("#eventTitle")).toHaveValue("Naturbad Vörden");
    await expect(page.locator("#eventLocation")).toHaveValue("Schulstraße 7, Vörden");
    await page.locator("#eventDate").fill("2030-06-12");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.goto("/#/kalender");
    await page.locator("#calendarDate").fill("2030-06-12");
    await page.locator("#calendarDate").dispatchEvent("change");
    await expect(page.locator("#calendarContent").getByText("Naturbad Vörden", { exact: true })).toBeVisible();
  });

  test("expected and confirmed admission dates remain distinct", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/kalender");
    await page.locator("#admissionDate").fill("2030-06-10");
    await page.locator("#admissionStatus").selectOption("expected");
    await page.locator("#admissionSource").fill("Synthetische Terminannahme");
    await page.getByRole("button", { name: "Reha-Zeitachse aktualisieren" }).click();
    await expect(page.getByText("Vorläufig – nicht bestätigt").first()).toBeVisible();
    await page.locator("#admissionStatus").selectOption("confirmed");
    await page.locator("#admissionSource").fill("Synthetische Bestätigung");
    await page.getByRole("button", { name: "Reha-Zeitachse aktualisieren" }).click();
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

  test("task details, personal notes and direct links are editable and expandable", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/listen");
    await page.locator("#taskGroup").selectOption("Organisation");
    await page.getByRole("button", { name: "Tierbetreuung für den Testzeitraum klären bearbeiten" }).click();
    await page.locator("#taskDetails").fill("Synthetischer Detailtext");
    await page.locator("#taskNote").fill("Synthetische eigene Notiz");
    await page.locator("#taskUrl").fill("https://example.invalid/aufgabe");
    await page.locator("#taskLinkLabel").fill("Synthetische Quelle öffnen");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    const row = page.locator(".check-row", { hasText: "Tierbetreuung für den Testzeitraum klären" });
    await row.locator("summary").click();
    await expect(row).toContainText("Synthetischer Detailtext");
    await expect(row).toContainText("Synthetische eigene Notiz");
    await expect(row.getByRole("link", { name: /Synthetische Quelle öffnen/ })).toHaveAttribute("href", "https://example.invalid/aufgabe");
  });

  test("postponed work remains visible and completed work has its own overview", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/heute");
    const title = await page.locator("#todayTitle").textContent();
    await page.getByRole("button", { name: "Verschieben", exact: true }).click();
    await page.locator("#taskActionDate").fill("2031-01-15");
    await page.locator("#taskActionReason").fill("Synthetisch später wieder vorlegen");
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await page.goto("/#/listen");
    await page.locator("#taskGroup").selectOption("all");
    await page.locator("#taskFilter").selectOption("postponed");
    const row = page.locator(".task-row", { hasText: title || "" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("wieder vorlegen");
    await row.locator('input[type="checkbox"]').check();
    await page.locator("#taskFilter").selectOption("done");
    await expect(page.locator(".task-row", { hasText: title || "" }).first()).toBeVisible();
    await page.goto("/#/heute");
    await page.getByRole("button", { name: /alle offen/ }).click();
    await expect(page).toHaveURL(/#\/listen/);
    await expect(page.locator("#taskFilter")).toHaveValue("open");
  });

  test("calendar appointments can be moved and store notes plus a direct link", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/kalender");
    await page.getByRole("button", { name: "Eintragen", exact: true }).click();
    await page.locator("#eventTitle").fill("Synthetischer verschiebbarer Termin");
    await page.locator("#eventDate").fill("2030-07-01");
    await page.locator("#eventNotes").fill("Synthetische Terminnotiz");
    await page.locator("#eventUrl").fill("https://example.invalid/termin");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.locator("#calendarDate").fill("2030-07-01");
    await page.locator("#calendarDate").dispatchEvent("change");
    await page.getByRole("button", { name: "Synthetischer verschiebbarer Termin bearbeiten" }).click();
    await page.locator("#eventDate").fill("2030-07-02");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.locator("#calendarDate").fill("2030-07-02");
    await page.locator("#calendarDate").dispatchEvent("change");
    const calendar = page.locator("#calendarContent");
    await expect(calendar).toContainText("Synthetischer verschiebbarer Termin");
    await expect(calendar).toContainText("Synthetische Terminnotiz");
    await expect(calendar.getByRole("link", { name: /Link öffnen/ })).toHaveAttribute("href", "https://example.invalid/termin");
  });

  test("breakfast and every recurring routine can be edited, rescheduled and paused as a series", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/kalender");
    const routine = page.locator(".routine-row", { hasText: "Frühstück" });
    await routine.getByRole("button", { name: /Frühstück bearbeiten/ }).click();
    await expect(page.getByRole("heading", { name: "Ganze Serie bearbeiten" })).toBeVisible();
    await page.locator("#eventTitle").fill("Frühstück – angepasst");
    await page.locator("#eventStart").fill("08:30");
    await page.locator("#eventRepeat").selectOption("weekly");
    await page.locator("#eventNotes").fill("Synthetische Seriennotiz");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    const changed = page.locator(".routine-row", { hasText: "Frühstück – angepasst" });
    await expect(changed).toContainText("Wöchentlich");
    await expect(changed).toContainText("08:30");
    await changed.getByRole("button", { name: "Pausieren" }).click();
    await expect(page.locator(".routine-row", { hasText: "Frühstück – angepasst" })).toContainText("pausiert");
    await page.locator(".routine-row", { hasText: "Frühstück – angepasst" }).getByRole("button", { name: "Aktivieren" }).click();
    await expect(page.locator(".routine-row", { hasText: "Frühstück – angepasst" })).not.toContainText("pausiert");
  });

  test("packing list is filterable and keeps encrypted checklist progress", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/entzug");
    await expect(page.locator("#carePacking .packing-item")).toHaveCount(2);
    const documentItem = page.locator(".packing-item", { hasText: "Synthetische Dokumentenmappe" });
    await documentItem.locator('input[type="checkbox"]').check();
    await expect(page.locator("#packingSummary")).toContainText("1 von 2");
    await page.getByRole("button", { name: "Noch offen" }).click();
    await expect(page.locator(".packing-item", { hasText: "Synthetische Dokumentenmappe" })).toHaveCount(0);
    await page.getByRole("button", { name: "Vorher klären" }).click();
    await expect(page.locator(".packing-item", { hasText: "Synthetisches Kissen" })).toBeVisible();
  });

  test("personal profile, weight entry and goals are editable", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/mehr");
    await page.getByRole("button", { name: "Profil", exact: true }).click();
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
    await expect(page.getByRole("heading", { name: "Alle Aufgaben im Überblick" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Alle Aufgaben im Überblick" })).toBeVisible();
    await page.reload();
    await expect(page.locator("#lockScreen")).toBeVisible();
    if (!(await page.locator("#accessCode").isVisible())) await page.locator("#codeFallback summary").click();
    await page.locator("#accessCode").fill("synthetic-access-code");
    await page.getByRole("button", { name: "Einmalig mit Code öffnen" }).click();
    await expect(page.locator("#appShell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alle Aufgaben im Überblick" })).toBeVisible();
    await expect(page.locator("#offlineBanner")).toBeVisible();
    await context.setOffline(false);
  });

  test("safe planning reset creates an encrypted backup and keeps archived documents", async ({ page }) => {
    await unlock(page);
    await page.goto("/#/dokumente");
    await page.locator("#archiveFile").setInputFiles({
      name: "vor-neustart.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetischer Beleg vor sicherem Neustart", "utf8")
    });
    await page.locator("#archiveName").fill("Beleg bleibt erhalten");
    await page.getByRole("button", { name: "Verschlüsselt speichern" }).click();
    await page.goto("/#/mehr");
    await page.getByRole("button", { name: "Daten", exact: true }).click();
    await page.getByRole("button", { name: "Sicheren Neustart prüfen" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Ja, durchführen" }).click();
    const backup = await download;
    expect(backup.suggestedFilename()).toMatch(/^rehakompass-vor-neustart-/);
    await expect(page).toHaveURL(/#\/entzug/);
    await page.goto("/#/dokumente");
    await expect(page.getByText("Beleg bleibt erhalten", { exact: true })).toBeVisible();
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
