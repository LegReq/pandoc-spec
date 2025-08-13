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

import { Logger } from "tslog";

/**
 * Determine if value is a non-null object.
 *
 * @param value
 * Value.
 *
 * @returns
 * True if value is a non-null object.
 */
export function isNonNullObject(value: unknown): value is NonNullable<object> {
    return typeof value === "object" && value !== null;
}

/**
 * Log level.
 */
export enum LogLevel {
    Silly, Trace, Debug, Info, Warn, Error, Fatal
}

/**
 * Map of log level strings to numeric values.
 */
const LOG_LEVELS_MAP = Object.entries(LogLevel).reduce((map, entry) => {
    if (typeof entry[1] === "number") {
        map.set(entry[0].toUpperCase(), entry[1]);
    }

    return map;
}, new Map<string, LogLevel>());

/**
 * Extended logger with simple log level management.
 */
export class ExtendedLogger<T> extends Logger<T> {
    /**
     * Constructor.
     *
     * @param name
     * Logger name.
     *
     * @param minLevel
     * Minimum level, either {@link LogLevel} or a string (case-insensitive) of the level (e.g., "debug"). Default is
     * {@link LogLevel.Info}.
     */
    constructor(name: string, minLevel: LogLevel | string | undefined = undefined) {
        super({
            name,
            minLevel: (typeof minLevel === "string" ? LOG_LEVELS_MAP.get(minLevel.toUpperCase()) : minLevel) ?? LogLevel.Info,
            hideLogPositionForProduction: true
        });
    }

    /**
     * Get the log level.
     */
    get logLevel(): LogLevel {
        return this.settings.minLevel;
    }

    /**
     * Set the log level.
     */
    set logLevel(value: LogLevel | string | undefined) {
        this.settings.minLevel = (typeof value === "string" ? LOG_LEVELS_MAP.get(value.toUpperCase()) : value) ?? LogLevel.Info;
    }

    /**
     * Determine if log level is valid for logger. Used to bypass code with complex log generation.
     *
     * @param logLevel
     * Log level.
     *
     * @returns
     * True if logger minimum level is less than or equal to desired log level.
     */
    validLogLevel(logLevel: LogLevel): boolean {
        return this.settings.minLevel <= (logLevel as number);
    }
}
