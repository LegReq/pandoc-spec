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
import fs from "fs";
import { globIterateSync } from "glob";
import path from "node:path";

/**
 * Get the module path of path relative to the module root.
 *
 * @param relativePath
 * Path relative to the module root.
 *
 * @returns
 * Module path.
 */
export function modulePath(relativePath: string): string {
    return decodeURI(new URL(relativePath, import.meta.url).pathname);
}

/**
 * Get the file path of path relative to the current working directory.
 *
 * @param relativePath
 * Path relative to the current working directory.
 *
 * @returns
 * File path.
 */
export function workingPath(relativePath: string): string;

/**
 * Get the file path of path relative to the current working directory.
 *
 * @param relativePath
 * Path relative to the current working directory or undefined.
 *
 * @returns
 * File path or undefined.
 */
export function workingPath(relativePath: string | undefined): string | undefined;

// eslint-disable-next-line jsdoc/require-jsdoc -- Overload implementation.
export function workingPath(relativePath: string | undefined): string | undefined {
    return relativePath !== undefined ? path.resolve(relativePath) : undefined;
}

/**
 * Copy files matching glob patterns to a directory.
 *
 * @param patterns
 * Glob patterns.
 *
 * @param toDirectory
 * Directory to which to copy files.
 */
export function copyFiles(patterns: string[], toDirectory: string): void {
    // Source files are expected to be relative to current directory.
    for (const sourceFile of globIterateSync(patterns)) {
        const destinationFile = path.resolve(toDirectory, path.isAbsolute(sourceFile) ? path.basename(sourceFile) : sourceFile);

        if (destinationFile === path.resolve(sourceFile)) {
            throw new Error(`File ${sourceFile} cannot be copied to itself.`);
        }

        const destinationDirectory = path.dirname(destinationFile);

        // Create destination directory if it doesn't exist.
        if (!fs.existsSync(destinationDirectory)) {
            fs.mkdirSync(destinationDirectory, {
                recursive: true
            });
        }

        fs.copyFileSync(sourceFile, destinationFile);
    }
}
