import { spawnSync } from "child_process";
import fs from "fs";

/**
 * Get the full path from a relative path.
 *
 * @param relativePath
 * Path relative to this module.
 *
 * @returns
 * Full path.
 */
function fullPath(relativePath: string): string {
    return decodeURI(new URL(relativePath, import.meta.url).pathname);
}

/**
 * Pandoc options.
 */
interface Options {
    debug?: boolean;

    verbose?: boolean;

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

    inputFile: string | string[];

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
export function exec(parameterOptions: unknown): never {
    const fileOptions: unknown = fs.existsSync("./pandoc-spec.options.json") ?
        JSON.parse(fs.readFileSync("./pandoc-spec.options.json", {
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

    const args: string[] = [
        "--standalone",
        arg("--verbose", options.verbose),
        arg("--from", options.inputFormat, "markdown"),
        arg("--to", options.outputFormat, "html"),
        arg("--shift-heading-level-by", options.shiftHeadingLevelBy, -1),
        arg("--number-sections", options.numberSections, true),
        arg("--toc", options.generateTOC, true),
        arg("--lua-filter", fullPath("../pandoc/include-files.lua")),
        arg("--lua-filter", fullPath("../pandoc/include-code-files.lua")),
        arg("--filter", "mermaid-filter"),
        arg("--filter", "pandoc-defref"),
        ...(options.filters ?? []).map(filter => arg(filter.type !== "json" ? "--lua-filter" : "--filter", filter.name)),
        arg("--template", options.templateFile, fullPath("../pandoc/template.html")),
        arg("--include-before-body", options.headerFile),
        arg("--include-after-body", options.footerFile),
        arg("--output", options.outputFile),
        ...(options.additionalOptions ?? []).map(additionalOption => arg(additionalOption.option, additionalOption.value)),
        ...(!Array.isArray(options.inputFile) ? [options.inputFile] : options.inputFile)
    ].filter(arg => arg !== "");

    if (options.debug ?? false) {
        console.error(`Base URL: ${import.meta.url}`);
        console.error(`Pandoc arguments:\n${args.join("\n")}`);
    }

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
    }

    // Exit with Pandoc status.
    process.exit(spawnResult.status);
}
