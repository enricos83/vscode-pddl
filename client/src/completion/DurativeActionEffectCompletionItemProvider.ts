/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, MarkdownString, Range, CompletionTriggerKind, CompletionItemKind } from 'vscode';
import { PDDL } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { parser } from 'pddl-workspace';
import { ModelHierarchy } from 'pddl-workspace';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { requires } from './DomainCompletionItemProvider';

export class DurativeActionEffectCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();

        let requiresDurativeActions = requires([':durative-actions']);

        this.addSuggestionDocumentation('at start', 'At start effect',
            new MarkdownString('Effect that takes place at the *start* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n:condition (and (at start (...) ) )\n:effect (and (at start (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);

        this.addSuggestionDocumentation('at end', 'At end effect',
            new MarkdownString('Effect that takes place at the *end* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n:condition (and (at end (...) ) )\n:effect (and (at end (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);
    }

    static inside(currentNode: parser.PddlSyntaxNode) {
        return ModelHierarchy.isInsideEffect(currentNode)
            && ModelHierarchy.isInsideDurativeActionUnqualifiedEffect(currentNode);
    }

    provide(_domainInfo: DomainInfo, context: CompletionContext, range: Range | null): (CompletionItem | null)[] {
        if (context.triggerKind !== CompletionTriggerKind.Invoke && context.triggerCharacter !== '(') { return []; }

        return [
            this.createSnippetCompletionItem(Suggestion.from("at start", context.triggerCharacter, '('),
                "(at start $0)",
                range, context, 1),
            this.createSnippetCompletionItem(Suggestion.from("at end", context.triggerCharacter, '('),
                "(at end $0)",
                range, context, 2)
        ];
    }
}