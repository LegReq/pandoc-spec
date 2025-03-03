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
import fs from "fs";
import * as path from "node:path";
import { copyFiles, modulePath, workingPath } from "./file.js";
import { PuppeteerConfigurator } from "./puppeteer.js";

/**
 * Pandoc options.
 */
interface Options {
    debug?: boolean;

    verbose?: boolean;

    autoDate?: boolean;

    inputFormat?: string;

    outputFormat?: string;

    shiftHeadingLevelBy?: number;

    numberSections?: boolean;

    generateTOC?: boolean;

    filters?: Array<{
        type?: "lua" | "json";

        name: string;
    }>;

    templateFile?: string;

    headerFile?: string;

    footerFile?: string;

    inputDirectory?: string;

    inputFile: string | string[];

    cssFile?: string | string[];

    resourceFile?: string | string[];

    outputDirectory?: string;

    cleanOutput?: boolean;

    outputFile: string;

    additionalOptions?: Array<{
        option: string;

        value?: string;
    }>;
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
    return "inputFile" in value && "outputFile" in value;
}

/**
 * Expand value to an array of strings.
 *
 * @param value
 * Value to expand.
 *
 * @returns
 * Array of strings.
 */
function expand(value: string | string[] | undefined): string[] {
    let result: string[];

    switch (typeof value) {
        case "undefined":
            result = [];
            break;

        case "string":
            result = [value];
            break;

        default:
            result = value;
            break;
    }

    return result;
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
 */
export function exec(parameterOptions?: unknown): never {
    const configurationFile = "pandoc-spec.options.json";

    const fileOptions: unknown = fs.existsSync(configurationFile) ?
        JSON.parse(fs.readFileSync(configurationFile, {
            encoding: "utf8"
        })) :
        undefined;

    if (fileOptions !== undefined && !isNonNullObject(fileOptions)) {
        throw new Error("pandoc-spec.options.json does not contain an object");
    }

    if (parameterOptions !== undefined && !isNonNullObject(parameterOptions)) {
        throw new Error("Parameter options must be an object");
    }

    // Build options from file options, overridden by parameter options.
    const options = {
        ...(fileOptions ?? {}),
        ...(parameterOptions ?? {})
    };

    if (!isOptions(options)) {
        throw new Error("Invalid Options from file and/or parameter");
    }

    const now = new Date();
    const adjustedNow = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);

    const inputDirectory = options.inputDirectory !== undefined ? path.resolve(options.inputDirectory) : process.cwd();
    const outputDirectory = options.outputDirectory !== undefined ? path.resolve(options.outputDirectory) : process.cwd();

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
        ...(options.filters ?? []).map(filter => filter.type !== "json" ? arg("--lua-filter", workingPath(filter.name)) : arg("--filter", filter.name)),
        arg("--template", workingPath(options.templateFile), modulePath("../pandoc/template.html")),
        arg("--include-before-body", workingPath(options.headerFile)),
        arg("--include-after-body", workingPath(options.footerFile)),
        ...expand(options.cssFile).map(cssFile => arg("--css", cssFile)),
        arg("--output", path.resolve(outputDirectory, options.outputFile)),
        ...(options.additionalOptions ?? []).map(additionalOption => arg(additionalOption.option, additionalOption.value)),
        ...expand(options.inputFile)
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

    const puppeteerConfigurator = new PuppeteerConfigurator(inputDirectory);

    // Run Pandoc in input directory.
    process.chdir(inputDirectory);

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

    if (status === 0) {
        // Copy CSS files if they are not URIs (i.e., don't start with a URI scheme); the minimum two-character requirement is so that Windows drive letters can be handled.
        copyFiles(expand(options.cssFile).filter(cssFile => !/^[A-Za-z][A-Za-z0-9+\-.]+:/.test(cssFile)), outputDirectory);

        // Copy resource files if defined.
        if (options.resourceFile !== undefined) {
            copyFiles(options.resourceFile, outputDirectory);
        }
    }

    // Exit with Pandoc status.
    process.exit(status);
}
