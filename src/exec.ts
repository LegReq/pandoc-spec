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

/* eslint-disable no-console -- Command-line application. */

import decamelize from "decamelize";
import meow, { type Flag, type FlagType } from "meow";
import type { AdditionalOption, Filter, Options, Style, Variable } from "./options.js";
import { PandocSpec } from "./pandoc-spec.js";

/**
 * Extended CLI flag.
 */
interface ExtendedFlag<PrimitiveType extends FlagType, Type, IsMultiple = false> extends Flag<PrimitiveType, Type, IsMultiple> {
    /**
     * CLI flag name if different from index name.
     */
    cliName?: string;

    /**
     * Help description.
     */
    description: string;

    /**
     * Function to parse components into object.
     *
     * @param components
     * Parsed components.
     *
     * @returns
     * Object constructed from parsed components.
     */
    parseMapper?: (components: string[]) => unknown;
}

/**
 * Any extended CLI flag.
 */
type AnyExtendedFlag =
    ExtendedFlag<"string", string> | ExtendedFlag<"string", string[], true> | ExtendedFlag<"boolean", boolean> | ExtendedFlag<"boolean", boolean[], true> | ExtendedFlag<"number", number> | ExtendedFlag<"number", number[], true>;

/**
 * Filter parse mapper.
 *
 * @param components
 * Components.
 *
 * @returns
 * Filter.
 */
function filterParseMapper(components: string[]): Filter {
    let filter: Filter;

    switch (components.length) {
        case 1:
            filter = {
                type: "lua",
                path: components[0]
            };
            break;

        case 2:
            filter = {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Let Pandoc handle invalid type.
                type: components[0] as "lua" | "json",
                path: components[1]
            };
            break;

        default: {
            throw new Error(`Invalid filter: ${components.join(":")}`);
        }
    }

    return filter;
}

/**
 * Variable parse mapper.
 *
 * @param components
 * Components.
 *
 * @returns
 * Variable.
 */
function variableParseMapper(components: string[]): Variable {
    let variable: Variable;

    switch (components.length) {
        case 1:
            variable = {
                key: components[0]
            };
            break;

        case 2:
            variable = {
                key: components[0],
                value: components[1]
            };
            break;

        default: {
            throw new Error(`Invalid variable: ${components.join(":")}`);
        }
    }

    return variable;
}

/**
 * Style parse mapper.
 *
 * @param components
 * Components.
 *
 * @returns
 * Style.
 */
function styleParseMapper(components: string[]): Style {
    let style: Style;

    switch (components.length) {
        case 2:
            style = {
                name: components[0],
                className: components[1]
            };
            break;

        default: {
            throw new Error(`Invalid style: ${components.join(":")}`);
        }
    }

    return style;
}

/**
 * Additional option parse mapper.
 *
 * @param components
 * Components.
 *
 * @returns
 * Additional option.
 */
function additionalOptionParseMapper(components: string[]): AdditionalOption {
    if (components.length !== 2) {
        throw new Error(`Invalid additional option: ${components.join(":")}`);
    }

    return {
        option: components[0],
        value: components[1]
    };
}

/**
 * Extended flags. Using a `Record` type ensures that all {@link Option} properties are available; adding or deleting a
 * property without updating this object will cause a compilation error.
 */
const extendedFlags: Record<keyof Options, AnyExtendedFlag> = {
    optionsFile: {
        type: "string",
        description: "Path of options file; default is pandoc-spec.options.json."
    },
    logLevel: {
        type: "string",
        description: "Log level, one of \"silly\", \"trace\", \"debug\", \"info\" (default), \"warn\", \"error\", or \"fatal\"."
    },
    verbose: {
        type: "boolean",
        description: "If true, passes --verbose to Pandoc for verbose output."
    },
    autoDate: {
        type: "boolean",
        description: "If true, adds a `date` value to the metadata in the format YYYY-MM-DD."
    },
    inputFormat: {
        type: "string",
        description: "Input file format."
    },
    outputFormat: {
        type: "string",
        description: "Output file format."
    },
    shiftHeadingLevelBy: {
        type: "number",
        description: "The amount by which to shift the section heading level. A value of -1 takes heading level 1 as the title."
    },
    numberSections: {
        type: "boolean",
        description: "If true, sections are numbered automatically."
    },
    generateTOC: {
        type: "boolean",
        description: "If true, a table of contents is generated from the headings."
    },
    filters: {
        type: "string",
        isMultiple: true,
        cliName: "filter",
        description: "Filter to be applied to the transformation. Format is [type:]path, where type is \"lua\" or \"json\". If type is not provided, default is \"lua\".",
        parseMapper: filterParseMapper
    },
    templateFile: {
        type: "string",
        description: "The Pandoc template to use in generating the output."
    },
    headerFile: {
        type: "string",
        description: "A header file to apply to the template."
    },
    footerFile: {
        type: "string",
        description: "A footer file to apply to the template"
    },
    variables: {
        type: "string",
        isMultiple: true,
        cliName: "variable",
        description: "Variable of the format key[:value] to be passed to the template file. If no value is specified, defaults to \"true\".",
        parseMapper: variableParseMapper
    },
    styles: {
        type: "string",
        isMultiple: true,
        cliName: "style",
        description: "Style of the format key:value to be added to the \"class\" attribute of component in the template file with the matching class.",
        parseMapper: styleParseMapper
    },
    inputDirectory: {
        type: "string",
        description: "The directory in which the input file or files reside."
    },
    inputFiles: {
        type: "string",
        isMultiple: true,
        cliName: "inputFile",
        description: "Input file."
    },
    cssFiles: {
        type: "string",
        isMultiple: true,
        cliName: "cssFile",
        description: "CSS file."
    },
    resourceFiles: {
        type: "string",
        isMultiple: true,
        cliName: "resourceFile",
        description: "Resource file (may be glob pattern) to be copied to the output directory."
    },
    outputDirectory: {
        type: "string",
        description: "The directory to which the output file will be written and CSS and resource files will be copied."
    },
    cleanOutput: {
        type: "boolean",
        description: "If true, the output directory is cleaned before Pandoc is run for the first time."
    },
    outputFile: {
        type: "string",
        description: "The name of the output file."
    },
    additionalReaderOptions: {
        type: "string",
        isMultiple: true,
        cliName: "additionalOption",
        description: "Additional Pandoc reader options to be added to the Pandoc command line. Format is option[:value].",
        parseMapper: additionalOptionParseMapper
    },
    additionalWriterOptions: {
        type: "string",
        isMultiple: true,
        cliName: "additionalOption",
        description: "Additional Pandoc writer options to be added to the Pandoc command line. Format is option[:value].",
        parseMapper: additionalOptionParseMapper
    },
    watch: {
        type: "boolean",
        description: "If true, the input directory is watched for changes and Pandoc is rerun when detected. Ignored if running inside a GitHub Action."
    },
    watchWait: {
        type: "number",
        description: "Time in milliseconds to wait for changes to be fully written before rerunning Pandoc."
    }
};

/**
 * Line length for help text.
 */
const LINE_LENGTH = 60;

/**
 * Log an error on fatal exception and set exit code.
 *
 * @param e
 * Error.
 */
function fatal(e: unknown): void {
    if (e instanceof Error) {
        console.error(e.message);
        if (e.stack !== undefined) {
            console.error(e.stack);
        }
    } else {
        console.error(String(e));
    }

    process.exitCode = 1;
}

/**
 * Run using command-line parameters.
 */
export function exec(): void {
    try {
        const cliNameMap = new Map<string, string>();

        let helpText = "Usage: pandoc-spec <options>\n";

        const cliFlags: Record<string, AnyExtendedFlag> = {};

        // Construct help text and CLI flags from extended flags.
        for (const [propertyName, extendedFlag] of Object.entries(extendedFlags)) {
            // Override property name with CLI name if provided.
            const cliName = extendedFlag.cliName ?? propertyName;

            // Map CLI name back to property name.
            cliNameMap.set(cliName, propertyName);

            // Get hyphenated CLI name for help text.
            const hyphenatedCLIName = decamelize(cliName, {
                separator: "-"
            });

            // Start with option.
            helpText += `--${hyphenatedCLIName}${extendedFlag.type === "boolean" ? ` | --no-${hyphenatedCLIName}` : ""}\n`;

            // Remaining description will shrink to nothing as word wrapping is applied.
            let remainingDescription = `${extendedFlag.description}${extendedFlag.isMultiple ?? false ? " Multiple permitted." : ""}`;

            while (remainingDescription.length !== 0) {
                if (remainingDescription.length <= LINE_LENGTH) {
                    // Remaining description is shorter than the line length.
                    helpText += `  ${remainingDescription}\n`;
                    remainingDescription = "";
                } else {
                    // Find the last space before the line length.
                    const spacePosition = remainingDescription.substring(0, LINE_LENGTH + 1).lastIndexOf(" ");

                    if (spacePosition !== -1) {
                        // Split at space character.
                        helpText += `  ${remainingDescription.substring(0, spacePosition)}\n`;
                        remainingDescription = remainingDescription.substring(spacePosition + 1);
                    } else {
                        // No space character; split at line length.
                        helpText += `  ${remainingDescription.substring(0, LINE_LENGTH)}\n`;
                        remainingDescription = remainingDescription.substring(LINE_LENGTH);
                    }
                }
            }

            // Add the extended flag to the CLI flags under the CLI name.
            cliFlags[cliName] = extendedFlag;
        }

        const cli = meow(helpText, {
            importMeta: import.meta,
            booleanDefault: undefined,
            allowUnknownFlags: false,
            flags: cliFlags
        });

        const options: Record<string, unknown> = {};

        for (const [cliName, value] of Object.entries(cli.flags)) {
            const propertyName = cliNameMap.get(cliName);

            // Ignore any options added automatically by CLI processor and any values that are zero length arrays.
            if (propertyName !== undefined && (!Array.isArray(value) || value.length !== 0)) {
                const parseMapper = cliFlags[cliName].parseMapper;

                if (parseMapper !== undefined) {
                    if (!Array.isArray(value)) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Options with parse keys are strings.
                        options[propertyName] = parseMapper((value as string).split(":"));
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Options with parse keys are strings.
                        options[propertyName] = (value as string[]).map(element => parseMapper(element.split(":")));
                    }
                } else {
                    // Add option as is.
                    options[propertyName] = value;
                }
            }
        }

        new PandocSpec(options).run().catch((e: unknown) => {
            fatal(e);
        });
    } catch (e: unknown) {
        fatal(e);
    }
}
