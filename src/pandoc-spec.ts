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

import { setTimeout } from "node:timers/promises";
import child_process from "child_process";
import chokidar from "chokidar";
import * as fs from "node:fs";
import * as path from "node:path";
import type * as Stream from "node:stream";
import { LogLevel } from "typescript-logging";
import { copyFiles, modulePath, workingPath } from "./file.js";
import { getLogger, updateLogger } from "./logger-helper.js";
import { PuppeteerConfigurator } from "./puppeteer.js";
import { isNonNullObject } from "./utility.js";

const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_SECOND = 1000;

const ISO_DATE_LENGTH = 10;

const DEFAULT_WATCH_WAIT_MILLISECONDS = 2000;

const logger = getLogger("");

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
 * Style.
 */
export interface Style {
    name: string;

    className: string;
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

    logLevel?: string;

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

    styles?: Style[];

    inputDirectory?: string;

    inputFiles: string[];

    cssFiles?: string[];

    resourceFiles?: string[];

    outputDirectory?: string;

    cleanOutput?: boolean;

    outputFile: string;

    additionalOptions?: AdditionalOption[];

    watch?: boolean;

    watchWait?: number;
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
 * Merge file and parameter options.
 *
 * @param fileOptions
 * File options.
 *
 * @param parameterOptions
 * Parameter options.
 *
 * @returns
 * Merged options.
 */
function mergeOptions(fileOptions: Partial<Options>, parameterOptions: Partial<Options> | undefined): Options {
    const options: Record<string, unknown> = {
        ...fileOptions
    };

    if (parameterOptions !== undefined) {
        // Parameter options override file options.
        for (const [key, value] of Object.entries(parameterOptions)) {
            if (!(key in options)) {
                options[key] = value;
            } else {
                const existingValue = options[key];

                if (!Array.isArray(value)) {
                    if (Array.isArray(existingValue)) {
                        throw new Error("Invalid options from file and/or parameter");
                    }

                    options[key] = value;
                } else {
                    if (!Array.isArray(existingValue)) {
                        throw new Error("Invalid options from file and/or parameter");
                    }

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Existing value is array of unknowns.
                    options[key] = [...existingValue, ...value];
                }
            }
        }
    }

    // Make sure that result meets the minimum requirements.
    if (!isOptions(options)) {
        throw new Error("Invalid options from file and/or parameter");
    }

    // Remove duplicate variables.
    if (options.variables !== undefined) {
        const variables = options.variables;

        options.variables = variables.filter((variable1, index1) => variables.find((variable2, index2) => index2 > index1 && variable2.key === variable1.key) === undefined);
    }

    // Remove duplicate styles.
    if (options.styles !== undefined) {
        const styles = options.styles;

        options.styles = styles.filter((style1, index1) => styles.find((style2, index2) => index2 > index1 && style2.name === style1.name) === undefined);
    }

    return options;
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
export async function pandocSpec(parameterOptions?: Partial<Options>): Promise<number> {
    let optionsFile: string;
    let optionsFileRequired: boolean;

    if (parameterOptions !== undefined && "optionsFile" in parameterOptions) {
        optionsFile = parameterOptions.optionsFile;
        optionsFileRequired = true;
    } else {
        optionsFile = "pandoc-spec.options.json";
        optionsFileRequired = false;
    }

    optionsFile = path.resolve(optionsFile);

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
    const options = mergeOptions(fileOptions, parameterOptions);

    if (options.logLevel !== undefined) {
        const logLevel = LogLevel.toLogLevel(options.logLevel);
        if (logLevel !== undefined) {
            updateLogger(logger, {
                level: logLevel
            });
        }
    }

    logger.trace(() => `Parameter options:\n${JSON.stringify(parameterOptions, null, 2)}`);
    logger.trace(() => `File options:\n${JSON.stringify(fileOptions, null, 2)}`);
    logger.trace(() => `Consolidated options:\n${JSON.stringify(options, null, 2)}`);

    // Make sure that result meets the minimum requirements.
    if (!isOptions(options)) {
        throw new Error("Invalid options from file and/or parameter");
    }

    const now = new Date();
    const adjustedNow = new Date(now.getTime() - now.getTimezoneOffset() * MINUTES_PER_HOUR * MILLISECONDS_PER_SECOND);

    const inputDirectory = options.inputDirectory !== undefined ? path.resolve(options.inputDirectory) : process.cwd();
    const outputDirectory = options.outputDirectory !== undefined ? path.resolve(options.outputDirectory) : process.cwd();

    const outputFormat = options.outputFormat ?? "html";

    const filters = options.filters ?? [];

    const luaFilters = filters.filter(filter => filter.type !== "json").map(filter => workingPath(filter.path));
    const jsonFilters = filters.filter(filter => filter.type === "json").map(filter => filter.path.includes("/") ? workingPath(filter.path) : filter.path);

    const templateFile = workingPath(options.templateFile ?? (outputFormat === "html" ? modulePath("../pandoc/template.html") : undefined));

    // CSS files don't apply if output format is not HTML.
    const cssFiles = options.cssFiles ?? [];

    // Add core SCSS, CSS, and map files as resource files only if output format is HTML.
    const coreCSSFiles = outputFormat === "html" ? [workingPath(modulePath("../pandoc/pandoc-spec.scss")), workingPath(modulePath("../pandoc/pandoc-spec.css")), workingPath(modulePath("../pandoc/pandoc-spec.css.map"))] : [];

    // Copy CSS files if they are not URIs (i.e., don't start with a URI scheme); the minimum two-character requirement is so that Windows drive letters can be handled.
    const inputResourceFiles = [...cssFiles.filter(cssFile => !/^[A-Za-z][A-Za-z0-9+\-.]+:/.test(cssFile)), ...coreCSSFiles, ...(options.resourceFiles ?? [])];

    // Styles are handled as variables with a "-style" suffix in the key and leading space in the value.
    const variables = [...(options.variables ?? []), ...(options.styles ?? []).map(style => ({
        key: `${style.name}-style`,
        value: ` ${style.className}`
    }))];

    // Add toc-header if not overridden.
    if (!variables.some(variable => variable.key === "toc-header")) {
        variables.push({
            key: "toc-header",
            value: "Table of Contents"
        });
    }

    const args: string[] = [
        arg("--verbose", options.verbose),
        arg("--metadata", options.autoDate ?? false ? `date:${adjustedNow.toISOString().substring(0, ISO_DATE_LENGTH)}` : undefined),
        arg("--from", options.inputFormat, "markdown"),
        arg("--shift-heading-level-by", options.shiftHeadingLevelBy, -1),
        arg("--number-sections", options.numberSections, true),
        arg("--toc", options.generateTOC, true),
        arg("--lua-filter", workingPath(modulePath("../pandoc/include-files.lua"))),
        arg("--lua-filter", workingPath(modulePath("../pandoc/include-code-files.lua"))),
        ...luaFilters.map(luaFilter => arg("--lua-filter", luaFilter)),
        arg("--template", templateFile),
        arg("--include-before-body", workingPath(options.headerFile)),
        arg("--include-after-body", workingPath(options.footerFile)),
        ...variables.map(variable => arg("--variable", variable.value !== undefined ? `${variable.key}:${variable.value}` : variable.key)),
        ...cssFiles.map(cssFile => arg("--css", cssFile)),
        ...(options.additionalOptions ?? []).map(additionalOption => arg(additionalOption.option, additionalOption.value)),
        ...options.inputFiles
    ].filter(arg => arg !== "");

    logger.debug(() => `Input directory: ${inputDirectory}`);
    logger.debug(() => `Output directory: ${outputDirectory}`);

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
    const status = await runPandoc(inputDirectory, inputResourceFiles, outputDirectory, options.outputFile, outputFormat, args, jsonFilters);

    // Ignore watch if running inside a GitHub Action.
    if (status === 0 && options.watch === true && process.env["GITHUB_ACTIONS"] !== "true") {
        const inputDirectoryStart = `${inputDirectory}/`;

        // Watch current (input) directory and all input resource files.
        const watchPaths = [".", ...inputResourceFiles];

        // Watch template file if defined.
        if (templateFile !== undefined) {
            watchPaths.push(templateFile);
        }

        // Ignore Puppeteer configuration file and Mermaid filter error file.
        const ignored = [".puppeteer.json", "mermaid-filter.err"];

        // Ignore options file if it's in the input directory.
        if (optionsFile.startsWith(inputDirectoryStart)) {
            ignored.push(optionsFile.substring(inputDirectory.length + 1));
        }

        // Ignore output directory if it's a subdirectory of the input directory.
        if (outputDirectory.startsWith(inputDirectoryStart)) {
            ignored.push(outputDirectory.substring(inputDirectory.length + 1));
        }

        const watchWait = options.watchWait ?? DEFAULT_WATCH_WAIT_MILLISECONDS;

        let abortController: AbortController | undefined = undefined;

        logger.info("Watching for changes...");

        chokidar.watch(watchPaths, {
            ignoreInitial: true,
            ignored,
            awaitWriteFinish: {
                stabilityThreshold: watchWait,
                pollInterval: 100
            }
        }).on("all", (eventName, path) => {
            logger.debug(`${eventName}: ${path}`);

            if (abortController !== undefined) {
                // Run Pandoc only after timeout after last event.
                abortController.abort();
            }

            abortController = new AbortController();

            setTimeout(watchWait, undefined, {
                signal: abortController.signal
            }).then(async () => {
                await runPandoc(inputDirectory, inputResourceFiles, outputDirectory, options.outputFile, outputFormat, args, jsonFilters);
                logger.info("Watching for changes...");
            }).catch((e: unknown) => {
                logger.error("Timer failed", e);
            });
        });
    }

    // Return Pandoc status.
    return status;
}

/**
 * Pipe run configuration.
 */
interface PipeRun {
    /**
     * If true, run command inside a shell.
     */
    shell: boolean;

    /**
     * Command.
     */
    command: string;

    /**
     * Arguments.
     */
    args: readonly string[];

    /**
     * If true, output is piped to the next pipe run.
     */
    pipeOutput: boolean;

    /**
     * Environment.
     */
    env?: NodeJS.ProcessEnv | undefined;
}

/**
 * Run Pandoc.
 *
 * Pandoc arguments.
 *
 * @param inputDirectory
 * Input directory.
 *
 * @param inputResourceFiles
 * Input resource files to copy to output directory.
 *
 * @param outputDirectory
 * Output directory.
 *
 * @param outputFile
 * Output file.
 *
 * @param outputFormat
 * Output format.
 *
 * @param args
 * Pandoc arguments.
 *
 * @param jsonFilters
 * JSON filters.
 *
 * @returns
 * Exit code from failed process or zero.
 */
async function runPandoc(inputDirectory: string, inputResourceFiles: string[], outputDirectory: string, outputFile: string, outputFormat: string, args: readonly string[], jsonFilters: readonly string[]): Promise<number> {
    const puppeteerConfigurator = new PuppeteerConfigurator(inputDirectory);

    let status = 0;

    try {
        const pipeRuns: PipeRun[] = [];

        pipeRuns.push({
            shell: false,
            command: "pandoc",
            args: [
                "--standalone",
                ...args,
                arg("--to", "json")
            ],
            pipeOutput: true
        });

        const isWindows = process.platform === "win32";

        for (const filter of ["mermaid-filter", "pandoc-defref", ...jsonFilters]) {
            // Mermaid filter should export as SVG.
            const env: NodeJS.ProcessEnv | undefined = filter === "mermaid-filter" ?
                {
                    ...process.env,
                    MERMAID_FILTER_FORMAT: "svg"
                } :
                undefined;

            // Some filters are scripts, which aren't recognized as executables in Windows.
            pipeRuns.push({
                shell: isWindows,
                command: filter,
                args: [outputFormat],
                pipeOutput: true,
                env
            });
        }

        pipeRuns.push({
            shell: false,
            command: "pandoc",
            args: [
                "--standalone",
                arg("--from", "json"),
                arg("--to", outputFormat),
                arg("--output", path.resolve(outputDirectory, outputFile))
            ],
            pipeOutput: false
        });

        let pipeStdin: Stream = process.stdin;

        const childProcessPromises: Array<Promise<number>> = [];

        for (const pipeRun of pipeRuns) {
            logger.debug(() => `Command: ${pipeRun.command}`);
            logger.debug(() => `Arguments:\n${pipeRun.args.join("\n")}`);

            const childProcess = child_process.spawn(pipeRun.command, pipeRun.args, {
                stdio: [pipeStdin, pipeRun.pipeOutput ? "pipe" : "inherit", "inherit"],
                env: pipeRun.env
            });

            // Stdout will be null only on the last pipe run.
            if (childProcess.stdout !== null) {
                pipeStdin = childProcess.stdout;
            }

            // eslint-disable-next-line promise/avoid-new -- Promise required to wait for processes to complete.
            childProcessPromises.push(new Promise<number>((resolve, reject) => {
                childProcess.on("close", (code, signal) => {
                    if (code !== null) {
                        if (code !== 0) {
                            logger.error(`Command failed with status ${code}`);
                        }

                        resolve(code);
                    } else {
                        reject(new Error(`Terminated by signal ${signal}`));
                    }
                });
            }));
        }

        const codes = await Promise.all(childProcessPromises).catch((e: unknown) => {
            logger.error("Process failed", e);

            return [-1];
        });

        // Get the first non-zero code.
        status = codes.reduce((currentCode, code) => currentCode !== 0 ? currentCode : code, 0);
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
        copyFiles(inputResourceFiles, outputDirectory);
    }

    // Return Pandoc status.
    return status;
}
