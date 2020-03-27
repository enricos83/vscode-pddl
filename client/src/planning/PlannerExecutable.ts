/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, window
} from 'vscode';

import * as process from 'child_process';
const tree_kill = require('tree-kill');

import { Planner } from './planner';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { utils, parser } from 'pddl-workspace';
import { Plan } from 'pddl-workspace';

export class PlannerExecutable extends Planner {

    // this property stores the reference to the planner child process, while planning is in progress
    private child: process.ChildProcess | undefined;

    constructor(plannerPath: string, private plannerOptions: string, private plannerSyntax: string, private workingDirectory: string) {
        super(plannerPath);
    }

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, parent: PlannerResponseHandler): Promise<Plan[]> {

        let domainFilePath = await utils.Util.toPddlFile("domain", domainFileInfo.getText());
        let problemFilePath = await utils.Util.toPddlFile("problem", problemFileInfo.getText());

        let command = this.plannerSyntax.replace('$(planner)', utils.Util.q(this.plannerPath))
            .replace('$(options)', this.plannerOptions)
            .replace('$(domain)', utils.Util.q(domainFilePath))
            .replace('$(problem)', utils.Util.q(problemFilePath));

        command += ' ' + parent.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).join(' ');

        parent.handleOutput(command + '\n');

        let thisPlanner = this;
        super.planningProcessKilled = false;

        if (workspace.getConfiguration("pddlPlanner").get("executionTarget") === "Terminal") {
            return new Promise<Plan[]>((resolve, _reject) => {
                let terminal = window.createTerminal({ name: "Planner output", cwd: thisPlanner.workingDirectory });
                terminal.sendText(command, true);
                terminal.show(true);
                let plans: Plan[] = [];
                resolve(plans);
            });
        }

        return new Promise<Plan[]>(function (resolve, reject) {
            thisPlanner.child = process.exec(command,
                { cwd: thisPlanner.workingDirectory },
                (error, _stdout, _stderr) => {
                    planParser.onPlanFinished();

                    if (error && !thisPlanner.child?.killed && !thisPlanner.planningProcessKilled) {
                        reject(error);
                    }

                    let plans = planParser.getPlans();
                    resolve(plans); // todo: should we resolve() even if we reject()ed above?
                    thisPlanner.child = undefined;
                });

            thisPlanner.child.stdout.on('data', (data: any) => {
                const dataString = data.toString();
                parent.handleOutput(dataString);
                planParser.appendBuffer(dataString);
            });
            thisPlanner.child.stderr.on('data', (data: any) => parent.handleOutput("Error: " + data));

            thisPlanner.child.on("close", (code: any, signal: any) => {
                if (code) { console.log("Exit code: " + code); }
                if (signal) { console.log("Exit Signal: " + signal); }
            });
        });
    }

    /**
     * When the UI button is pressed, the planner is forced to stop.
     */
    stop(): void {
        if (this.child) {
            super.stop();

            // try to kill just the shell
            // this.child.kill();//'SIGINT');
            // this.child.stdin.pause();
            tree_kill(this.child.pid);
        }
    }
}