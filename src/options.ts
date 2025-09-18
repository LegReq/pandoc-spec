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

    additionalReaderOptions?: AdditionalOption[];

    additionalWriterOptions?: AdditionalOption[];

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
export function isOptions(value: NonNullable<object>): value is Options {
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
export function mergeOptions(fileOptions: Partial<Options>, parameterOptions: Partial<Options> | undefined): Options {
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
