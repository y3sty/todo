# Daily list — todo s Google Tabulkami

## Spuštění

Otevři `index.html` v prohlížeči. Pro lokální server můžeš použít například `python3 -m http.server 8000` a otevřít `http://localhost:8000`.

## Napojení na Google Tabulky

1. Vytvoř Google Tabulku.
2. V menu otevři **Rozšíření → Apps Script** a vlož obsah `google-apps-script/Code.gs`.
3. Klikni **Nasadit → Nové nasazení**, vyber typ **Webová aplikace**, nastav spuštění jako **já** a přístup na **Kdokoli**.
4. Zkopíruj URL nasazení.
5. V aplikaci otevři ozubené kolečko a URL vlož do nastavení.

Tabulka se vytvoří automaticky na listu `Úkoly` se sloupci `id`, `title`, `done`, `createdAt`. Aplikace při změně odešle celý seznam, takže změny zůstávají synchronizované mezi zařízeními.

Poznámka: Nastavení „Kdokoli“ znamená, že každý, kdo zná URL webové aplikace, může seznam upravit. Pro osobní použití URL nesdílej veřejně.
