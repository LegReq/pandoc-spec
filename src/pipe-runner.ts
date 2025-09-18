import child_process from "child_process";
import fs from "node:fs";
import path from "node:path";
import type Stream from "node:stream";
import { copyFiles } from "./file.js";
import { getLogger, type Logger } from "./logger-helper.js";
import { PuppeteerConfigurator } from "./puppeteer.js";

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
 * Pipe runner.
 */
export class PipeRunner {
    private readonly _logger: Logger;

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
     * @param verbose
     * If true, run Pandoc in verbose mode.
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
     */
    constructor(verbose: boolean, inputDirectory: string, inputResourceFiles: string[], outputDirectory: string, outputFile: string, outputFormat: string, args: readonly string[], jsonFilters: readonly string[]) {
        this._logger = getLogger("pipe-runner");

        this._inputDirectory = inputDirectory;
        this._inputResourceFiles = inputResourceFiles;
        this._outputDirectory = outputDirectory;

        const verboseArg = PipeRunner.arg("--verbose", verbose);
        const pandocArgs = verboseArg !== "" ? [verboseArg, "--standalone"] : ["--standalone"];

        this._pipeRuns = [];

        // First pipe run is Pandoc with most arguments.
        this._pipeRuns.push({
            shell: false,
            command: "pandoc",
            args: [
                ...pandocArgs,
                ...args,
                PipeRunner.arg("--to", "json")
            ]
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
            args: [
                ...pandocArgs,
                PipeRunner.arg("--from", "json"),
                PipeRunner.arg("--to", outputFormat),
                PipeRunner.arg("--output", path.resolve(outputDirectory, outputFile))
            ]
        });
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
     *
     * @returns
     * Exit code of failed process or 0 if successful.
     */
    async run(): Promise<void> {
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
}
