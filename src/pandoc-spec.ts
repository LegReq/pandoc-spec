/*!
 * Copyright © 2025 Legendary Requirements
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable no-console -- Console application. */

import { spawnSync } from "child_process";
import chokidar from "chokidar";
import fs from "fs";
import * as path from "node:path";
import { copyFiles, modulePath, workingPath } from "./file.js";
import { PuppeteerConfigurator } from "./puppeteer.js";

/**
 * Filter.
 */
export interface Filter {
    type: "lua" | "json";

    path: string;
}

/**
 * Variable.
 */
export interface Variable {
    key: string;

    value?: string;
}

/**
 *  Additional option.
 */
export interface AdditionalOption {
    option: string;

    value?: string;
}

/**
 * Pandoc options.
 */
export interface Options {
    optionsFile?: string;

    debug?: boolean;

    verbose?: boolean;

    autoDate?: boolean;

    inputFormat?: string;

    outputFormat?: string;

    shiftHeadingLevelBy?: number;

    numberSections?: boolean;

    generateTOC?: boolean;

    filters?: Filter[];

    templateFile?: string;

    headerFile?: string;

    footerFile?: string;

    variables?: Variable[];

    inputDirectory?: string;

    inputFiles: string[];

    cssFiles?: string[];

    resourceFiles?: string[];

    outputDirectory?: string;

    cleanOutput?: boolean;

    outputFile: string;

    additionalOptions?: AdditionalOption[];

    watch?: boolean;

    watchTemplateFile?: boolean;

    watchWait?: number;
}

/**
 * Determine if value is a non-null object.
 *
 * @param value
 * Value.
 *
 * @returns
 * True if value is a non-null object.
 */
function isNonNullObject(value: unknown): value is NonNullable<object> {
    return typeof value === "object" && value !== null;
}

/**
 * Determine if value satisfies Options type.
 *
 * @param value
 * Value.
 *
 * @returns
 * True if value has all non-nullable Options properties.
 */
function isOptions(value: NonNullable<object>): value is Options {
    return "inputFiles" in value && "outputFile" in value;
}

/**
 * Build an argument from an option and an optional value.
 *
 * @param option
 * Option, added verbatim to command-line if conditions are met.
 *
 * @param value
 * Value.
 *
 * @param defaultValue
 * Default value if value is undefined.
 *
 * @returns
 * If final value is undefined, result is an empty array. Otherwise, if final value is boolean, result is the option
 * alone. Otherwise, result is the option and the final value.
 */
function arg<T>(option: string, value: T | undefined, defaultValue?: T): string {
    let result: string;

    const finalValue = value ?? defaultValue;

    if (finalValue !== undefined) {
        if (typeof finalValue === "boolean") {
            if (finalValue) {
                // Option doesn't take a value.
                result = option;
            } else {
                result = "";
            }
        } else {
            // Option takes a value.
            result = `${option}=${String(finalValue)}`;
        }
    } else {
        result = "";
    }

    return result;
}

/**
 * Run Pandoc with appropriate command-line arguments.
 *
 * @param parameterOptions
 * Options from which to build command-line arguments.
 *
 * @returns
 * Pandoc exit code.
 */
export function pandocSpec(parameterOptions?: Partial<Options>): number {
    let optionsFile: string;
    let optionsFileRequired: boolean;

    if (parameterOptions !== undefined && "optionsFile" in parameterOptions) {
        optionsFile = parameterOptions.optionsFile;
        optionsFileRequired = true;
    } else {
        optionsFile = "pandoc-spec.options.json";
        optionsFileRequired = false;
    }

    let fileOptions: Partial<Options>;

    if (fs.existsSync(optionsFile)) {
        const jsonContent: unknown = JSON.parse(fs.readFileSync(optionsFile, {
            encoding: "utf8"
        }));

        if (!isNonNullObject(jsonContent)) {
            throw new Error(`${optionsFile} does not contain an object`);
        }

        fileOptions = jsonContent;
    } else {
        if (optionsFileRequired) {
            throw new Error(`Options file ${optionsFile} not found`);
        }

        fileOptions = {};
    }

    // Build options from file options, overridden by parameter options.
    const options = parameterOptions === undefined ?
        fileOptions :
        {
            ...fileOptions,
            ...parameterOptions
        };

    // Make sure that result meets the minimum requirements.
    if (!isOptions(options)) {
        throw new Error("Invalid options from file and/or parameter");
    }

    const now = new Date();
    const adjustedNow = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);

    const inputDirectory = options.inputDirectory !== undefined ? path.resolve(options.inputDirectory) : process.cwd();
    const outputDirectory = options.outputDirectory !== undefined ? path.resolve(options.outputDirectory) : process.cwd();

    const templateFile = workingPath(options.templateFile ?? (options.outputFormat === undefined || options.outputFormat === "html" ? modulePath("../pandoc/template.html") : undefined));

    const variables = options.variables ?? [];

    // Add toc-header if not overridden.
    if (!variables.some(variable => variable.key === "toc-header")) {
        variables.push({
            key: "toc-header",
            value: "Table of Contents"
        });
    }

    const args: string[] = [
        "--standalone",
        arg("--verbose", options.verbose),
        arg("--metadata", options.autoDate ?? false ? `date:${adjustedNow.toISOString().substring(0, 10)}` : undefined),
        arg("--from", options.inputFormat, "markdown"),
        arg("--to", options.outputFormat, "html"),
        arg("--shift-heading-level-by", options.shiftHeadingLevelBy, -1),
        arg("--number-sections", options.numberSections, true),
        arg("--toc", options.generateTOC, true),
        arg("--lua-filter", modulePath("../pandoc/include-files.lua")),
        arg("--lua-filter", modulePath("../pandoc/include-code-files.lua")),
        arg("--filter", "mermaid-filter"),
        arg("--filter", "pandoc-defref"),
        ...(options.filters ?? []).map(filter => filter.type !== "json" ? arg("--lua-filter", workingPath(filter.path)) : arg("--filter", filter.path.includes("/") ? workingPath(filter.path) : filter.path)),
        arg("--template", templateFile),
        arg("--include-before-body", workingPath(options.headerFile)),
        arg("--include-after-body", workingPath(options.footerFile)),
        ...variables.map(variable => arg("--variable", variable.value !== undefined ? `${variable.key}:${variable.value}` : variable.key)),
        ...(options.cssFiles ?? []).map(cssFile => arg("--css", cssFile)),
        arg("--output", path.resolve(outputDirectory, options.outputFile)),
        ...(options.additionalOptions ?? []).map(additionalOption => arg(additionalOption.option, additionalOption.value)),
        ...options.inputFiles
    ].filter(arg => arg !== "");

    if (options.debug ?? false) {
        console.error(`Input directory: ${inputDirectory}`);
        console.error(`Output directory: ${outputDirectory}`);

        console.error(`Pandoc arguments:\n${args.join("\n")}`);
    }

    if (options.cleanOutput ?? false) {
        fs.rmSync(outputDirectory, {
            recursive: true,
            force: true
        });
    }

    // Create output directory if it doesn't exist.
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, {
            recursive: true
        });
    }

    // Run Pandoc in input directory.
    process.chdir(inputDirectory);

    // Pandoc must run successfully the first time.
    const status = runPandoc(args, inputDirectory, outputDirectory, options);

    // Ignore watch if running inside a GitHub Action.
    if (status === 0 && options.watch === true && process.env["GITHUB_ACTIONS"] !== "true") {
        console.error("Watching for changes...");

        const watchWait = options.watchWait ?? 2000;

        let timeout: NodeJS.Timeout | undefined = undefined;

        // Watch current (input) directory and optionally the template file.
        chokidar.watch(options.watchTemplateFile !== true || templateFile === undefined ? "." : [".", templateFile], {
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: watchWait,
                pollInterval: 100
            }
        }).on("all", () => {
            if (timeout === undefined) {
                timeout = setTimeout(() => {
                    runPandoc(args, inputDirectory, outputDirectory, options);
                }, watchWait);
            } else {
                // Run Pandoc only after timeout after last event. If not running, this will reactivate it.
                timeout.refresh();
            }
        });
    }

    // Return Pandoc status.
    return status;
}

/**
 * Run Pandoc.
 *
 * @param args
 * Pandoc arguments.
 *
 * @param inputDirectory
 * Input directory.
 *
 * @param outputDirectory
 * Output directory.
 *
 * @param options
 * Options.
 *
 * @returns
 * Pandoc exit code.
 */
function runPandoc(args: readonly string[], inputDirectory: string, outputDirectory: string, options: Options): number {
    const puppeteerConfigurator = new PuppeteerConfigurator(inputDirectory);

    let status = 0;

    try {
        const spawnResult = spawnSync("pandoc", args, {
            stdio: ["inherit", "inherit", "inherit"]
        });

        if (spawnResult.error !== undefined) {
            throw spawnResult.error;
        }

        if (spawnResult.status === null) {
            throw new Error(`Terminated by signal ${spawnResult.signal}`);
        }

        if (spawnResult.status !== 0) {
            console.error(`Failed with status ${spawnResult.status}`);
            status = spawnResult.status;
        }
    } finally {
        // Restore Puppeteer configuration.
        puppeteerConfigurator.finalize();

        const mermaidFilterErrorFile = "mermaid-filter.err";

        // Delete empty Mermaid filter error file.
        if (fs.existsSync(mermaidFilterErrorFile) && fs.readFileSync(mermaidFilterErrorFile).toString() === "") {
            fs.rmSync(mermaidFilterErrorFile);
        }
    }

    if (status === 0 && outputDirectory !== inputDirectory) {
        if (options.cssFiles !== undefined) {
            // Copy CSS files if they are not URIs (i.e., don't start with a URI scheme); the minimum two-character requirement is so that Windows drive letters can be handled.
            copyFiles(options.cssFiles.filter(cssFile => !/^[A-Za-z][A-Za-z0-9+\-.]+:/.test(cssFile)), outputDirectory);
        }

        // Copy resource files if defined.
        if (options.resourceFiles !== undefined) {
            copyFiles(options.resourceFiles, outputDirectory);
        }
    }

    // Return Pandoc status.
    return status;
}
