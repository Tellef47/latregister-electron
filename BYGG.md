# Låtregister — Electron-app

## Krav
- Node.js installert (sjekk med `node -v` i Terminal)

## Bygg

```bash
cd latregister-electron
npm install
npm run build
```

Ferdig `.app` ligger i `dist/mac-arm64/Låtregister.app`.

## Datafiler
Tre JSON-filer lagres i samme mappe som `.app`-filen:
- `latregister-data.json` — låtar, samlingar, koplingar
- `latregister-noter.json` — enkeltnoter (eldre format)
- `latregister-noter2.json` — noterlister med tittel/sti/kommentar

## Utvikling
```bash
npm start
```
