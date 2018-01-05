/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { workspace, window, ExtensionContext, commands, Uri, ViewColumn, Range, StatusBarAlignment, extensions, TextDocument, languages } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, State } from 'vscode-languageclient';

import { Planning } from './planning'

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, PddlRange } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';
import { Authentication } from '../../common/src/Authentication';
import { PlanReportGenerator } from './PlanReportGenerator';
import { Plan } from './plan';
import { AutoCompletion } from './AutoCompletion';

const PDDL_STOP_PLANNER = 'pddl.stopPlanner';
const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL_GENERATE_PLAN_REPORT = 'pddl.planReport';
const PDDL = 'PDDL';

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'server', 'src', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

	let pddlConfiguration = new PddlConfiguration(context);
	uninstallLegacyExtension(pddlConfiguration);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for PDDL documents
		documentSelector: [{ scheme: 'file', language: 'pddl' }],
		synchronize: {
			// Synchronize the setting section 'pddlParser' to the server
			configurationSection: 'pddlParser',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	// Create the language client and start the client.
	let languageClient = new LanguageClient('pddlParser', 'PDDL Language Server', serverOptions, clientOptions);
	context.subscriptions.push(languageClient.start());

	const status = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	status.text = '$(server)';
	status.tooltip = 'Stop the planning engine.'

	let pddlWorkspace = new PddlWorkspace();
	subscribeToWorkspace(pddlWorkspace, context);
	let planning = new Planning(pddlWorkspace, pddlConfiguration, context, status);

	let planCommand = commands.registerCommand('pddl.planAndDisplayResult', () => {
		planning.plan();
	});

	let revealActionCommand = commands.registerCommand('pddl.revealAction', (domainFileUri: Uri, actionName: String) => {
		revealAction(<DomainInfo>pddlWorkspace.getFileInfo(domainFileUri.toString()), actionName);
	});

	let stopPlannerCommand = commands.registerCommand(PDDL_STOP_PLANNER, () => planning.stopPlanner());
	status.command = PDDL_STOP_PLANNER;

	let configureParserCommand = commands.registerCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.setupParserLater = false;
		pddlConfiguration.suggestNewParserConfiguration(false);
	});

	let loginParserServiceCommand = commands.registerCommand(PDDL_LOGIN_PARSER_SERVICE, () => {
		let authentication = createAuthentication(pddlConfiguration);
		authentication.login(pddlConfiguration.savePddlParserAuthenticationTokens, () => { console.log('Login failure.'); });
	});

	let updateTokensParserServiceCommand = commands.registerCommand(PDDL_UPDATE_TOKENS_PARSER_SERVICE, () => {
		let authentication = createAuthentication(pddlConfiguration);
		authentication.updateTokens(pddlConfiguration.savePddlParserAuthenticationTokens, () => { console.log('Couldn\'t update the tokens, try to login.'); });
	});

	let configurePlannerCommand = commands.registerCommand(PDDL_CONFIGURE_PLANNER, () => {
		pddlConfiguration.askNewPlannerPath();
	});
	
	let generatePlanReportCommand = commands.registerCommand(PDDL_GENERATE_PLAN_REPORT, () => {
		let plans: Plan[] = planning.getPlans();

		if(plans!=null){
			new PlanReportGenerator(context, 1000, true).export(plans, plans.length - 1);
		} else {
			window.showErrorMessage("There is no plan to export.");
		}
	});
	
	// when the extension is done loading, subscribe to the client-server communication
	let stateChangeHandler = languageClient.onDidChangeState((stateEvent) => {
		if (stateEvent.newState == State.Running) languageClient.onRequest('pddl.configureParser', (showNever) => {
			pddlConfiguration.suggestNewParserConfiguration(showNever);
		});
	});

	let completionItemProvider = languages.registerCompletionItemProvider(PDDL.toLowerCase(), new AutoCompletion(pddlWorkspace));

	// Push the disposables to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(planCommand, revealActionCommand, planning.planDocumentProviderRegistration, 
		status, stopPlannerCommand, stateChangeHandler, configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand, 
		configurePlannerCommand, generatePlanReportCommand, completionItemProvider);
}

function createAuthentication(pddlConfiguration: PddlConfiguration): Authentication {
    let configuration = pddlConfiguration.getPddlParserServiceAuthenticationConfiguration();
	return new Authentication(configuration.url, configuration.requestEncoded, configuration.clientId, 
		configuration.tokensvcUrl, configuration.tokensvcApiKey, configuration.tokensvcAccessPath, configuration.tokensvcValidatePath,
	    configuration.tokensvcCodePath, configuration.tokensvcRefreshPath, configuration.tokensvcSvctkPath,
        configuration.refreshToken, configuration.accessToken, configuration.sToken);
}

async function revealAction(domainInfo: DomainInfo, actionName: String) {
	let document = await workspace.openTextDocument(Uri.parse(domainInfo.fileUri));
	let actionFound = domainInfo.actions.find(a => a.name.toLowerCase() == actionName.toLowerCase());
	let actionRange = actionFound ? toRange(actionFound.location) : null;
	window.showTextDocument(document.uri, { viewColumn: ViewColumn.One, preserveFocus: true, preview: true, selection: actionRange });
}

function toRange(pddlRange: PddlRange): Range {
	return new Range(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
}

function subscribeToWorkspace(pddlWorkspace: PddlWorkspace, context: ExtensionContext): void {
	workspace.textDocuments
		.filter(textDoc => isPddl(textDoc))
		.forEach(textDoc => {
			pddlWorkspace.upsertFile(textDoc.uri.toString(), textDoc.version, textDoc.getText());
		});

	context.subscriptions.push(workspace.onDidOpenTextDocument(textDoc => { if(isPddl(textDoc)) pddlWorkspace.upsertFile(textDoc.uri.toString(), textDoc.version, textDoc.getText())}));
	context.subscriptions.push(workspace.onDidChangeTextDocument(docEvent => { 
		if(isPddl(docEvent.document)) 
			pddlWorkspace.upsertFile(docEvent.document.uri.toString(), docEvent.document.version, docEvent.document.getText())
		}));
	context.subscriptions.push(workspace.onDidCloseTextDocument(docEvent => { if(isPddl(docEvent)) pddlWorkspace.removeFile(docEvent.uri.toString())}));
}

function isPddl(doc: TextDocument): boolean {
	return doc.languageId.toLowerCase() == PDDL.toLowerCase();
}

function uninstallLegacyExtension(pddlConfiguration: PddlConfiguration) {
	let extension = extensions.getExtension("jan-dolejsi.pddl-parser");
	
	if (extension) {
		pddlConfiguration.copyFromLegacyParserConfig()
		window.showWarningMessage(`The internal preview extension 'PDDL SL8 Only' is now obsolete. Please uninstall it, or it will interfere with functionality of the PDDL extension.`);
	}
}