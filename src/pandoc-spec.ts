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

import child_process from "child_process";
import chokidar from "chokidar";
import fs from "node:fs";
import path from "node:path";
import type Stream from "node:stream";
import { setTimeout } from "node:timers/promises";
import { LogLevel } from "typescript-logging";
import { copyFiles, modulePath, workingPath } from "./file.js";
import { getLogger, type Logger, updateLogger } from "./logger-helper.js";
import { isOptions, mergeOptions, type Options } from "./options.js";
import { PuppeteerConfigurator } from "./puppeteer.js";
import { isNonNullObject } from "./utility.js";

const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_SECOND = 1000;

const ISO_DATE_LENGTH = 10;

const DEFAULT_WATCH_WAIT_MILLISECONDS = 2000;

/**
 * Pipe run configuration.
 */
interface PipeRun {
    /**
     * Command.
     */
    command: string;

    /**
     * Arguments.
     */
    args: readonly string[];

    /**
     * If true, run command inside a shell.
     */
    shell: boolean;

    /**
     * Environment.
     */
    env?: NodeJS.ProcessEnv | undefined;
}

/**
 * Pandoc spec builder.
 */
export class PandocSpec {
    private readonly _logger: Logger;

    private readonly _options: Options;

    private readonly _optionsFile: string;

    private readonly _templateFile: string | undefined;

    private readonly _inputDirectory: string;

    private readonly _inputResourceFiles: string[];

    private readonly _outputDirectory: string;

    private readonly _pipeRuns: PipeRun[];

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
    static arg<T>(option: string, value: T | undefined, defaultValue?: T): string {
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
     * Constructor.
     *
     * @param parameterOptions
     * Options from which to build command-line arguments.
     */
    constructor(parameterOptions?: Partial<Options>) {
        const logger = getLogger("pipe-runner");
        this._logger = logger;

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

        this._options = options;

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

        this._optionsFile = optionsFile;
        this._templateFile = templateFile;
        this._inputDirectory = inputDirectory;
        this._inputResourceFiles = inputResourceFiles;
        this._outputDirectory = outputDirectory;

        const verboseArg = PandocSpec.arg("--verbose", verbose);

        const pandocInputArgs: string[] = [
            verboseArg,

            PandocSpec.arg("--from", options.inputFormat, "markdown"),
            PandocSpec.arg("--to", "json"),

            PandocSpec.arg("--metadata", options.autoDate ?? false ? `date:${adjustedNow.toISOString().substring(0, ISO_DATE_LENGTH)}` : undefined),
            PandocSpec.arg("--shift-heading-level-by", options.shiftHeadingLevelBy, -1),

            PandocSpec.arg("--lua-filter", workingPath(modulePath("../pandoc/include-files.lua"))),
            PandocSpec.arg("--lua-filter", workingPath(modulePath("../pandoc/include-code-files.lua"))),
            ...luaFilters.map(luaFilter => PandocSpec.arg("--lua-filter", luaFilter)),

            ...(options.additionalReaderOptions ?? []).map(additionalReaderOption => PandocSpec.arg(additionalReaderOption.option, additionalReaderOption.value)),

            ...options.inputFiles
        ].filter(arg => arg !== "");

        const pandocOutputArgs: string[] = [
            verboseArg,

            "--standalone",

            PandocSpec.arg("--from", "json"),
            PandocSpec.arg("--to", outputFormat),
            PandocSpec.arg("--output", path.resolve(outputDirectory, options.outputFile)),

            PandocSpec.arg("--number-sections", options.numberSections, true),
            PandocSpec.arg("--toc", options.generateTOC, true),

            PandocSpec.arg("--template", templateFile),
            PandocSpec.arg("--include-before-body", workingPath(options.headerFile)),
            PandocSpec.arg("--include-after-body", workingPath(options.footerFile)),

            ...variables.map(variable => PandocSpec.arg("--variable", variable.value !== undefined ? `${variable.key}:${variable.value}` : variable.key)),
            ...cssFiles.map(cssFile => PandocSpec.arg("--css", cssFile)),
            ...(options.additionalWriterOptions ?? []).map(additionalWriterOption => PandocSpec.arg(additionalWriterOption.option, additionalWriterOption.value))
        ].filter(arg => arg !== "");

        this._pipeRuns = [];

        // First pipe run is Pandoc with input arguments.
        this._pipeRuns.push({
            shell: false,
            command: "pandoc",
            args: pandocInputArgs
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
            this._pipeRuns.push({
                shell: isWindows,
                command: filter,
                args: [outputFormat],
                env
            });
        }

        // Last pipe run is Pandoc with output arguments.
        this._pipeRuns.push({
            shell: false,
            command: "pandoc",
            args: pandocOutputArgs
        });

        // Run in input directory.
        process.chdir(inputDirectory);
    }

    /**
     * Spawn the next pipe run.
     *
     * @param index
     * Index of pipe run.
     *
     * @param pipeStdin
     * Standard input or null.
     */
    private async spawn(index: number, pipeStdin: Stream | null): Promise<void> {
        const pipeRun = this._pipeRuns[index];
        const isLast = index === this._pipeRuns.length - 1;

        this._logger.debug(() => `Command[${index}]: ${pipeRun.command}`);
        this._logger.debug(() => `Arguments[${index}]: [${pipeRun.args.join(", ")}]`);

        const childProcess = child_process.spawn(pipeRun.command, pipeRun.args, {
            shell: pipeRun.shell,
            stdio: [pipeStdin ?? "inherit", !isLast ? "pipe" : "inherit", "inherit"],
            env: pipeRun.env
        });

        // eslint-disable-next-line promise/avoid-new -- Promise required to wait for processes to complete.
        await new Promise<void>((resolve, reject) => {
            if (!isLast) {
                childProcess.on("spawn", () => {
                    // Spawn next pipe run.
                    resolve(this.spawn(index + 1, childProcess.stdout));
                });
            }

            childProcess.on("close", (code, signal) => {
                if (code !== null) {
                    this._logger.debug(() => `Code[${index}]: ${code}`);
                    this._logger.debug(() => `Signal[${index}]: ${signal}`);

                    if (code !== 0) {
                        reject(new Error(`Command[${index}] ${pipeRun.command} failed with status ${code}`));
                    } else if (isLast) {
                        // Only last pipe run resolves.
                        resolve();
                    }
                } else {
                    // Null code means terminated by signal.
                    reject(new Error(`Command[${index}] terminated by signal ${signal}`));
                }
            });
        });
    }

    /**
     * Run the pipes.
     */
    async runPipes(): Promise<void> {
        const puppeteerConfigurator = new PuppeteerConfigurator(this._inputDirectory);

        await this.spawn(0, null).then(() => {
            if (this._outputDirectory !== this._inputDirectory) {
                copyFiles(this._inputResourceFiles, this._outputDirectory);
            }
        }).finally(() => {
            // Restore Puppeteer configuration.
            puppeteerConfigurator.finalize();

            const mermaidFilterErrorFile = "mermaid-filter.err";

            // Delete empty Mermaid filter error file.
            if (fs.existsSync(mermaidFilterErrorFile) && fs.readFileSync(mermaidFilterErrorFile).toString() === "") {
                fs.rmSync(mermaidFilterErrorFile);
            }
        });
    }

    /**
     * Run the pandoc-spec process.
     */
    async run(): Promise<void> {
        await this.runPipes().then(() => {
            const options = this._options;
            const logger = this._logger;

            // Ignore watch if running inside a GitHub Action.
            if (options.watch === true && process.env["GITHUB_ACTIONS"] !== "true") {
                const inputDirectoryStart = `${this._inputDirectory}/`;

                // Watch current (input) directory and all input resource files.
                const watchPaths = [".", ...this._inputResourceFiles];

                // Watch template file if defined.
                if (this._templateFile !== undefined) {
                    watchPaths.push(this._templateFile);
                }

                // Ignore Puppeteer configuration file and Mermaid filter error file.
                const ignored = [".puppeteer.json", "mermaid-filter.err"];

                // Ignore options file if it's in the input directory.
                if (this._optionsFile.startsWith(inputDirectoryStart)) {
                    ignored.push(this._optionsFile.substring(this._inputDirectory.length + 1));
                }

                // Ignore output directory if it's a subdirectory of the input directory.
                if (this._outputDirectory.startsWith(inputDirectoryStart)) {
                    ignored.push(this._outputDirectory.substring(this._inputDirectory.length + 1));
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
                        await this.run();
                        logger.info("Watching for changes...");
                    }).catch((e: unknown) => {
                        // Ignore abort error.
                        if (!(e instanceof Error) || e.name !== "AbortError") {
                            logger.error("Timer failed", e);
                        }
                    });
                });
            }
        });
    }
}
