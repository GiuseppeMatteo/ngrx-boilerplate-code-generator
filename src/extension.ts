import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Project, SyntaxKind } from "ts-morph";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "ngrx-generator.createNgRxFiles",
    async () => {
      if (
        !vscode.workspace.workspaceFolders ||
        vscode.workspace.workspaceFolders.length === 0
      ) {
        vscode.window.showErrorMessage(
          "Apri prima una cartella di progetto in VS Code."
        );
        return;
      }

      let featureName = await vscode.window.showInputBox({
        prompt: "Nome della feature (es. users)",
        placeHolder: "featureName",
      });

      if (!featureName) {
        vscode.window.showErrorMessage("Nome feature obbligatorio");
        return;
      }

      const normalizedfeatureName = normalizeFeatureName(featureName);

      // Cartella fissa: src/app/core/store/<featureName>
      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

      // crea l'interfaccia
      const interfacePath = path.join(
        workspacePath,
        "src",
        "app",
        "shared",
        "models"
      );

      if (!fs.existsSync(interfacePath)) {
        fs.mkdirSync(interfacePath, { recursive: true });
      }

      const Ifiles = {
        [`I${capitalize(normalizedfeatureName)}.ts`]: getInterface(normalizedfeatureName),
      };

      for (const [filename, content] of Object.entries(Ifiles)) {
        fs.writeFileSync(path.join(interfacePath, filename), content);
      }

      vscode.window.showInformationMessage(`Creata l'interfaccia I${capitalize(normalizedfeatureName)} in src/app/shared/models`);


      const featurePath = path.join(
        workspacePath,
        "src",
        "app",
        "core",
        "store",
        normalizedfeatureName
      );

      fs.mkdirSync(featurePath, { recursive: true });

      const files = {
        [`${normalizedfeatureName}.actions.ts`]: getActionsTemplate(normalizedfeatureName),
        [`${normalizedfeatureName}.effects.ts`]: getEffectsTemplate(normalizedfeatureName),
        [`${normalizedfeatureName}.feature.ts`]: getFeatureTemplate(normalizedfeatureName),
      };

      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(featurePath, filename), content);
      }

      updateAppConfig(normalizedfeatureName, workspacePath);

      vscode.window.showInformationMessage(
        `File NgRx creati in src/app/store/${normalizedfeatureName}`
      );
    }
  );

  context.subscriptions.push(disposable);
}

function normalizeFeatureName(raw: string): string {
  // Rimuove caratteri non alfanumerici, gestisce gli spazi e converte in camelCase
  return raw
    .replace(/[^a-zA-Z0-9]+/g, " ") // Trasforma tutto ciò che non è alfanumerico in spazio
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getInterface(name: string) {
  const cap = capitalize(name);

  return `export interface I${cap} {
      id: string | number;
      name: string;
      description: string;
    }`;
}

function getActionsTemplate(name: string) {
  const cap = capitalize(name);
  return `import { createActionGroup, props, emptyProps } from '@ngrx/store';
import { I${cap} } from '@app/shared/models/I${cap}';

export const ${name}Actions = createActionGroup({
  source: '${cap}',
  events: {
    'Load ${cap}': emptyProps(),
    'Load ${cap} Success': props<{ items: I${cap}[] }>(),
    'Load ${cap} Failure': emptyProps()
  }
});
`;
}

function getEffectsTemplate(name: string) {
  const cap = capitalize(name);
  return `import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ${name}Actions } from './${name}.actions';
import { map } from 'rxjs/operators';
import { I${cap} } from '@app/shared/models/I${cap}';

export const ${name}LoadEffects = createEffect(
  (actions = inject(Actions)) => {
    return actions.pipe(
      ofType(${name}Actions.load${cap}),
      map(() => ${name}Actions.load${cap}Success({ items: [] }))
    );
  },
  { functional: true }
);
`;
}

function getFeatureTemplate(name: string) {
  const cap = capitalize(name);
  return `import { createFeature, createReducer, on } from '@ngrx/store';
import { ${name}Actions } from './${name}.actions';
import { I${cap} } from '@app/shared/models/I${cap}';

export interface I${cap}State {
  items: I${cap}[];
  error: boolean;
  pending: boolean;
}

const INITIALSTATE: I${cap}State = {
  items: [],
  error: false,
  pending: false,
};

export const ${name}Feature = createFeature({
  name: '${name}',
  reducer: createReducer(
    INITIALSTATE,
    on(${name}Actions.load${cap}, (state): I${cap}State => ({ ...state, error:false, pending: true })),
    on(${name}Actions.load${cap}Success, (state, action): I${cap}State => ({ ...state, items: action.items, error:false, pending: false })),
    on(${name}Actions.load${cap}Failure, (state): I${cap}State => ({ ...state, error:true, pending: false }))
  )
});

export const { selectError, selectItems, selectPending } =
  ${name}Feature;
`;
}

/**
 * Aggiorna src/app/app.config.ts aggiungendo:
 *  - l'import di provideState / provideEffects (se mancanti)
 *  - l'import della feature/effects della feature specificata
 *  - una entry separata provideState(<featureName>Feature) nella lista providers
 *  - inserisce l'Effect dentro una provideEffects(...) esistente (array o argomenti),
 *    oppure crea una nuova entry provideEffects(<Cap>Effects)
 */
export function updateAppConfig(
  featureName: string,
  workspacePath: string
): void {
  const cap = capitalize(featureName);
  const appConfigPath = path.join(workspacePath, "src", "app", "app.config.ts");

  if (!fs.existsSync(appConfigPath)) {
    vscode.window.showErrorMessage(`Non trovato: ${appConfigPath}`);
    return;
  }

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(appConfigPath);

  // Import nominato
  function ensureNamedImport(moduleSpecifier: string, name: string) {
    const existing = sourceFile
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
    if (existing) {
      const names = existing.getNamedImports().map((n) => n.getName());
      if (!names.includes(name)) {
        existing.addNamedImport(name);
      }
    } else {
      sourceFile.addImportDeclaration({
        moduleSpecifier,
        namedImports: [name],
      });
    }
  }

  // Import namespace
  function ensureNamespaceImport(moduleSpecifier: string, alias: string) {
    const existing = sourceFile
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
    if (existing) {
      if (!existing.getNamespaceImport()) {
        existing.remove();
        sourceFile.addImportDeclaration({
          moduleSpecifier,
          namespaceImport: alias,
        });
      }
    } else {
      sourceFile.addImportDeclaration({
        moduleSpecifier,
        namespaceImport: alias,
      });
    }
  }

  ensureNamedImport("@ngrx/effects", "provideEffects");
  ensureNamedImport("@ngrx/store", "provideState");
  ensureNamedImport(
    `./core/store/${featureName}/${featureName}.feature`,
    `${featureName}Feature`
  );
  ensureNamespaceImport(
    `./core/store/${featureName}/${featureName}.effects`,
    `${featureName}Effects`
  );

  // --- trova property assignment "providers: [ ... ]" ---
  const propAssignments = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment
  );
  let providersPA = propAssignments.find(
    (pa) =>
      pa.getName() === "providers" &&
      pa.getInitializer()?.getKind() === SyntaxKind.ArrayLiteralExpression
  );

  if (!providersPA) {
    // se non esiste, creiamo una nuova export const providers = [...]
    sourceFile.insertStatements(
      sourceFile.getEnd(),
      `\nexport const providers = [\n  provideState(${featureName}Feature),\n  provideEffects(${featureName}Effects),\n];\n`
    );
    sourceFile.saveSync();
    vscode.window.showInformationMessage(
      `app.config.ts: creato providers con provideState/provideEffects`
    );
    return;
  }

  const arr = providersPA.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression
  );

  // --- 1) aggiungi provideState(<featureName>Feature) come entry separata se manca ---
  const stateIdentifier = `${featureName}Feature`;
  const stateAlready = arr
    .getElements()
    .some((el) => el.getText().includes(stateIdentifier));
  if (!stateAlready) {
    arr.addElement(
      `provideState({name: ${stateIdentifier}.name,reducer: ${stateIdentifier}.reducer,}),`
    );
  }

  // --- 2) gestisci provideEffects: cerca una call a provideEffects(...) negli elementi top-level ---
  const nameEffects = `${featureName}Effects`;
  let effectsHandled = false;

  for (const elem of arr.getElements()) {
    // vogliamo solo le chiamate top-level: es. provideEffects(...) come elemento dell'array providers
    const call = elem.asKind(SyntaxKind.CallExpression);
    if (!call) {
      continue;
    }

    const exprText = call.getExpression().getText();

    if (exprText === "provideEffects" || exprText.endsWith(".provideEffects")) {
      const args = call.getArguments();
      if (
        args.length === 1 &&
        args[0].getKind() === SyntaxKind.ArrayLiteralExpression
      ) {
        // caso: provideEffects([A, B])
        const arrayArg = args[0].asKindOrThrow(
          SyntaxKind.ArrayLiteralExpression
        );
        const already = arrayArg
          .getElements()
          .some((e) => e.getText().trim() === nameEffects);
        if (!already) {
          arrayArg.addElement(nameEffects);
        }
      } else {
        // caso: provideEffects(A, B, ...)
        const argsText = args.map((a) => a.getText()).join(", ");
        if (
          !argsText
            .split(",")
            .map((s) => s.trim())
            .includes(nameEffects)
        ) {
          // ricrea la call con l'arg aggiunto (metodo robusto)
          const newCallText = `${call.getExpression().getText()}(${argsText}${argsText ? ", " : ""
            }${nameEffects})`;
          call.replaceWithText(newCallText);
        }
      }
      effectsHandled = true;
      break;
    }
  }

  // se non abbiamo trovato provideEffects top-level, aggiungiamone una nuova entry
  if (!effectsHandled) {
    arr.addElement(`provideEffects(${nameEffects})`);
  }

  // salva il file (sincrono)
  sourceFile.saveSync();
  vscode.window.showInformationMessage(
    `app.config.ts aggiornato: added provideState(${stateIdentifier}) and provideEffects(${nameEffects})`
  );
}

export function deactivate() { }
