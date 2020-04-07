/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionItemKind, MarkdownString, SnippetString } from 'vscode';
import { DomainInfo, TypeObjectMap } from 'pddl-workspace';
import { Variable } from 'pddl-workspace';

export abstract class Delegate {

    constructor(){

    }

    createOperator(label: string, detail: string, documentation: string | MarkdownString, snippet?: SnippetString): CompletionItem {
        return this.createCompletionItem(label, detail, documentation, CompletionItemKind.Operator, snippet);
    }

    createParameterized(label: string, detail: string, documentation: string | MarkdownString, snippet?: SnippetString): CompletionItem {
        return this.createCompletionItem(label, detail, documentation, CompletionItemKind.TypeParameter, snippet);
    }

    createCompletionItem(label: string, detail: string, documentation: string | MarkdownString, kind: CompletionItemKind, snippet?: SnippetString): CompletionItem {
        const item = new CompletionItem(label, kind);
        item.detail = detail;
        item.documentation = documentation;
        if (snippet) { item.insertText = snippet; }
        return item;
    }

    static toNamesCsv(variables: Variable[]): string {
        return variables
            .map(var1 => var1.name)
            .join(',');
    }

    static toTypeLessNamesCsv(variables: Variable[]): string {
        return variables
            .map(var1 => var1.declaredNameWithoutTypes)
            .join(',');
    }

    getObjects(allTypeObjects: TypeObjectMap, types: string[]): string[] {
        return types.map(typeName => allTypeObjects.getTypeCaseInsensitive(typeName))
            .filter(typeObjects => !!typeObjects)
            .map(typeObjects => typeObjects!.getObjects())
            .reduce((x, y) => x.concat(y), []); // flat map
    }

    getTypesInvolved(variables: Variable[], domainFile: DomainInfo): string[] {
        const typesDirectlyInvolved = variables.map(p => p.parameters)
            .reduce((x, y) => x.concat(y), []) // flat map
            .map(p => p.type)
            .filter((v, i, a) => a.indexOf(v) === i); // distinct

        const typesInheriting = typesDirectlyInvolved
            .map(type1 => domainFile.getTypesInheritingFrom(type1))
            .reduce((x, y) => x.concat(y), []);

        return typesInheriting.concat(typesDirectlyInvolved);
    }

    getSymmetricPredicates(domainFile: DomainInfo): Variable[] {
        return domainFile.getPredicates().filter(this.isSymmetric);
    }

    getSymmetricFunctions(domainFile: DomainInfo): Variable[] {
        return domainFile.getFunctions().filter(this.isSymmetric);
    }

    isSymmetric(variable: Variable): boolean {
        // the predicate has exactly 2 parameters
        return variable.parameters.length === 2
            // and the parameters are of the same type
            && variable.parameters[0].type === variable.parameters[1].type;
    }

}