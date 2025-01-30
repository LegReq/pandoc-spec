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
 * @param pattern
 * Glob pattern(s).
 *
 * @param toDirectory
 * Directory to which to copy files.
 */
export function copyFiles(pattern: string | string[], toDirectory: string): void {
    // Source files are expected to be relative to current directory.
    for (const sourceFile of globIterateSync(pattern)) {
        const destinationFile = path.resolve(toDirectory, sourceFile);

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
