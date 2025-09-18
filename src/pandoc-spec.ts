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

import chokidar from "chokidar";
import * as fs from "node:fs";
import * as path from "node:path";
import { setTimeout } from "node:timers/promises";
import { LogLevel } from "typescript-logging";
import { modulePath, workingPath } from "./file.js";
import { getLogger, updateLogger } from "./logger-helper.js";
import { PipeRunner } from "./pipe-runner.js";
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
 * Run Pandoc with appropriate command-line arguments.
 *
 * @param parameterOptions
 * Options from which to build command-line arguments.
 */
export function pandocSpec(parameterOptions?: Partial<Options>): void {
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

    const verbose = options.verbose ?? false;

    const args: string[] = [
        PipeRunner.arg("--metadata", options.autoDate ?? false ? `date:${adjustedNow.toISOString().substring(0, ISO_DATE_LENGTH)}` : undefined),
        PipeRunner.arg("--from", options.inputFormat, "markdown"),
        PipeRunner.arg("--shift-heading-level-by", options.shiftHeadingLevelBy, -1),
        PipeRunner.arg("--number-sections", options.numberSections, true),
        PipeRunner.arg("--toc", options.generateTOC, true),
        PipeRunner.arg("--lua-filter", workingPath(modulePath("../pandoc/include-files.lua"))),
        PipeRunner.arg("--lua-filter", workingPath(modulePath("../pandoc/include-code-files.lua"))),
        ...luaFilters.map(luaFilter => PipeRunner.arg("--lua-filter", luaFilter)),
        PipeRunner.arg("--template", templateFile),
        PipeRunner.arg("--include-before-body", workingPath(options.headerFile)),
        PipeRunner.arg("--include-after-body", workingPath(options.footerFile)),
        ...variables.map(variable => PipeRunner.arg("--variable", variable.value !== undefined ? `${variable.key}:${variable.value}` : variable.key)),
        ...cssFiles.map(cssFile => PipeRunner.arg("--css", cssFile)),
        ...(options.additionalOptions ?? []).map(additionalOption => PipeRunner.arg(additionalOption.option, additionalOption.value)),
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

    const pipeRunner = new PipeRunner(verbose, inputDirectory, inputResourceFiles, outputDirectory, options.outputFile, outputFormat, args, jsonFilters);

    /**
     * Catch handler.
     *
     * @param e
     * Error.
     */
    function catchHandler(e: unknown): void {
        logger.error("pandoc-spec failed", e);
    }

    pipeRunner.run().then(() => {
        // Ignore watch if running inside a GitHub Action.
        if (options.watch === true && process.env["GITHUB_ACTIONS"] !== "true") {
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
            // let timeout: NodeJS.Timeout | undefined = undefined;

            logger.info("Watching for changes...");

            chokidar.watch(watchPaths, {
                ignoreInitial: true,
                ignored,
                awaitWriteFinish: {
                    stabilityThreshold: 500,
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
                    await pipeRunner.run();
                    logger.info("Watching for changes...");
                }).catch((e: unknown) => {
                    // Ignore abort error.
                    if (!(e instanceof Error) || e.name !== "AbortError") {
                        logger.error("Timer failed", e);
                    }
                });
            });
        }
    }).catch(catchHandler);
}
