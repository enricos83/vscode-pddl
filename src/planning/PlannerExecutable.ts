/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    workspace, window
} from 'vscode';

import * as process from 'child_process';
import treeKill = require('tree-kill');

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

        const domainFilePath = await utils.Util.toPddlFile("domain", domainFileInfo.getText());
        const problemFilePath = await utils.Util.toPddlFile("problem", problemFileInfo.getText());

        let command = this.plannerSyntax.replace('$(planner)', utils.Util.q(this.plannerPath))
            .replace('$(options)', this.plannerOptions)
            .replace('$(domain)', utils.Util.q(domainFilePath))
            .replace('$(problem)', utils.Util.q(problemFilePath));

        command += ' ' + parent.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).join(' ');

        parent.handleOutput(command + '\n');

        const thisPlanner = this;
        super.planningProcessKilled = false;

        if (workspace.getConfiguration("pddlPlanner").get("executionTarget") === "Terminal") {
            return new Promise<Plan[]>((resolve) => {
                const terminal = window.createTerminal({ name: "Planner output", cwd: thisPlanner.workingDirectory });
                terminal.sendText(command, true);
                terminal.show(true);
                const plans: Plan[] = [];
                resolve(plans);
            });
        }

        return new Promise<Plan[]>(function (resolve, reject) {
            thisPlanner.child = process.exec(command,
                { cwd: thisPlanner.workingDirectory },
                (error) => {
                    planParser.onPlanFinished();

                    if (error && !thisPlanner.child?.killed && !thisPlanner.planningProcessKilled) {
                        reject(error);
                    }

                    const plans = planParser.getPlans();
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
            treeKill(this.child.pid);
        }
    }
}