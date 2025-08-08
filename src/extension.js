"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.updateAppConfig = updateAppConfig;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ts_morph_1 = require("ts-morph");
function activate(context) {
    let disposable = vscode.commands.registerCommand("ngrx-generator.createNgRxFiles", async () => {
        if (!vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("Apri prima una cartella di progetto in VS Code.");
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
        featureName = normalizeFeatureName(featureName);
        // Cartella fissa: src/app/core/store/<featureName>
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const featurePath = path.join(workspacePath, "src", "app", "core", "store", featureName);
        fs.mkdirSync(featurePath, { recursive: true });
        const files = {
            [`${featureName}.actions.ts`]: getActionsTemplate(featureName),
            [`${featureName}.effects.ts`]: getEffectsTemplate(featureName),
            [`${featureName}.feature.ts`]: getFeatureTemplate(featureName),
        };
        for (const [filename, content] of Object.entries(files)) {
            fs.writeFileSync(path.join(featurePath, filename), content);
        }
        updateAppConfig(featureName, workspacePath);
        vscode.window.showInformationMessage(`File NgRx creati in src/app/store/${featureName}`);
    });
    context.subscriptions.push(disposable);
}
function normalizeFeatureName(raw) {
    // Rimuove caratteri non alfanumerici e converte in camelCase
    const cleaned = raw
        .replace(/[^a-zA-Z0-9]+/g, " ") // tutto ciò che non è alfanumerico diventa spazio
        .trim()
        .split(/\s+/) // separa per spazi
        .map((word, i) => i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    return cleaned;
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function getActionsTemplate(name) {
    const cap = capitalize(name);
    return `import { createActionGroup, props, emptyProps } from '@ngrx/store';

export const ${name}Actions = createActionGroup({
  source: '${cap}',
  events: {
    'Load ${cap}': emptyProps(),
    'Load ${cap} Success': props<{ items: any[] }>(),
    'Load ${cap} Failure': emptyProps()
  }
});
`;
}
function getEffectsTemplate(name) {
    const cap = capitalize(name);
    return `import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ${name}Actions } from './${name}.actions';
import { map } from 'rxjs/operators';

export const ${name}Effects = createEffect((_actions = inject(Actions)) => {
  return _actions.pipe(
    ofType((${name}Actions.load${cap}),
    map(() => ${name}Actions.load${cap}Success({ data: [] }))
  );
},
  { functional: true }
);
`;
}
function getFeatureTemplate(name) {
    const cap = capitalize(name);
    return `import { createFeature, createReducer, on } from '@ngrx/store';
import { ${name}Actions } from './${name}.actions';

export interface I${cap}State {
  list: any[];
  error: boolean;
  pending: boolean;
}

const INITIALSTATE: I${cap}State = {
  list: [],
  error: false,
  pending: false,
};

export const ${name}Feature = createFeature({
  name: '${name}',
  reducer: createReducer(
    INITIALSTATE,
    on(${name}Actions.load${cap}, (state): I${cap}State => ({ ...state, error:false, pending: true })),
    on(${name}Actions.load${cap}Success, (state, action): I${cap}State => ({ ...state, list: action.items, error:false, pending: false })),
    on(${name}Actions.load${cap}Failure, (state, action): I${cap}State => ({ ...state, error:true, pending: false }))
  )
});
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
function updateAppConfig(featureName, workspacePath) {
    const cap = capitalize(featureName);
    const appConfigPath = path.join(workspacePath, "src", "app", "app.config.ts");
    if (!fs.existsSync(appConfigPath)) {
        vscode.window.showErrorMessage(`Non trovato: ${appConfigPath}`);
        return;
    }
    const project = new ts_morph_1.Project({ skipAddingFilesFromTsConfig: true });
    const sourceFile = project.addSourceFileAtPath(appConfigPath);
    // Import nominato
    function ensureNamedImport(moduleSpecifier, name) {
        const existing = sourceFile
            .getImportDeclarations()
            .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
        if (existing) {
            const names = existing.getNamedImports().map((n) => n.getName());
            if (!names.includes(name))
                existing.addNamedImport(name);
        }
        else {
            sourceFile.addImportDeclaration({
                moduleSpecifier,
                namedImports: [name],
            });
        }
    }
    // Import namespace
    function ensureNamespaceImport(moduleSpecifier, alias) {
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
        }
        else {
            sourceFile.addImportDeclaration({
                moduleSpecifier,
                namespaceImport: alias,
            });
        }
    }
    ensureNamedImport("@ngrx/effects", "provideEffects");
    ensureNamedImport("@ngrx/store", "provideState");
    ensureNamedImport(`./core/store/${featureName}/${featureName}.feature`, `${featureName}Feature`);
    ensureNamespaceImport(`./core/store/${featureName}/${featureName}.effects`, `${featureName}Effects`);
    // --- trova property assignment "providers: [ ... ]" ---
    const propAssignments = sourceFile.getDescendantsOfKind(ts_morph_1.SyntaxKind.PropertyAssignment);
    let providersPA = propAssignments.find((pa) => pa.getName() === "providers" &&
        pa.getInitializer()?.getKind() === ts_morph_1.SyntaxKind.ArrayLiteralExpression);
    if (!providersPA) {
        // se non esiste, creiamo una nuova export const providers = [...]
        sourceFile.insertStatements(sourceFile.getEnd(), `\nexport const providers = [\n  provideState(${featureName}Feature),\n  provideEffects(${featureName}Effects),\n];\n`);
        sourceFile.saveSync();
        vscode.window.showInformationMessage(`app.config.ts: creato providers con provideState/provideEffects`);
        return;
    }
    const arr = providersPA.getInitializerIfKindOrThrow(ts_morph_1.SyntaxKind.ArrayLiteralExpression);
    // --- 1) aggiungi provideState(<featureName>Feature) come entry separata se manca ---
    const stateIdentifier = `${featureName}Feature`;
    const stateAlready = arr
        .getElements()
        .some((el) => el.getText().includes(stateIdentifier));
    if (!stateAlready) {
        arr.addElement(`provideState({name: ${stateIdentifier}.name,reducer: ${stateIdentifier}.reducer,}),`);
    }
    // --- 2) gestisci provideEffects: cerca una call a provideEffects(...) negli elementi top-level ---
    const nameEffects = `${featureName}Effects`;
    let effectsHandled = false;
    for (const elem of arr.getElements()) {
        // vogliamo solo le chiamate top-level: es. provideEffects(...) come elemento dell'array providers
        const call = elem.asKind(ts_morph_1.SyntaxKind.CallExpression);
        if (!call)
            continue;
        const exprText = call.getExpression().getText();
        if (exprText === "provideEffects" || exprText.endsWith(".provideEffects")) {
            const args = call.getArguments();
            if (args.length === 1 &&
                args[0].getKind() === ts_morph_1.SyntaxKind.ArrayLiteralExpression) {
                // caso: provideEffects([A, B])
                const arrayArg = args[0].asKindOrThrow(ts_morph_1.SyntaxKind.ArrayLiteralExpression);
                const already = arrayArg
                    .getElements()
                    .some((e) => e.getText().trim() === nameEffects);
                if (!already)
                    arrayArg.addElement(nameEffects);
            }
            else {
                // caso: provideEffects(A, B, ...)
                const argsText = args.map((a) => a.getText()).join(", ");
                if (!argsText
                    .split(",")
                    .map((s) => s.trim())
                    .includes(nameEffects)) {
                    // ricrea la call con l'arg aggiunto (metodo robusto)
                    const newCallText = `${call.getExpression().getText()}(${argsText}${argsText ? ", " : ""}${nameEffects})`;
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
    vscode.window.showInformationMessage(`app.config.ts aggiornato: added provideState(${stateIdentifier}) and provideEffects(${nameEffects})`);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map