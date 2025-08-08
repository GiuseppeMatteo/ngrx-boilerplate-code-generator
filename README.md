# NgRx boilerplate code generator for VS Code

Estensione di VS Code per generare automaticamente i file NgRx (`actions`, `effects`, `feature`) usando le API moderne di NgRx (`createActionGroup`, `createEffect`, `createFeature`).  
Aggiorna inoltre automaticamente il file `app.config.ts` per registrare gli effects e la feature.

---

## Funzionalità

- Genera i file base NgRx per una nuova feature (`actions.ts`, `effects.ts`, `feature.ts`) con codice boilerplate pronto all'uso.
- Aggiunge automaticamente `provideState` e `provideEffects` nel file `app.config.ts`.
- Gestisce correttamente gli import di feature (import nominato) ed effetti (import namespace con `* as ...Effects`).
- Usa una cartella fissa nel progetto per creare i file (`src/app/core/store/<featureName>`).
- Normalizza il nome della feature eliminando caratteri speciali e applicando camelCase.

---

## Come usarla

1. Apri il comando **NgRx feature** dalla Command Palette (`Ctrl+Shift+P` o `Cmd+Shift+P`).
2. Inserisci il nome della feature (es. `mediaPlayer`).
3. L'estensione creerà i file necessari sotto `src/app/core/store/mediaPlayer`.
4. Aggiornerà automaticamente `src/app/app.config.ts` per aggiungere la feature e gli effetti.

---

## Requisiti

- VS Code >= 1.XX.X
- Node.js >= 14
- Progetto Angular con NgRx già installato
- File `src/app/app.config.ts` presente
