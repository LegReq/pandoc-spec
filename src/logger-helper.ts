import { type CoreLogger, LogLevel } from "typescript-logging";
import { CategoryProvider } from "typescript-logging-category-style";

const provider = CategoryProvider.createProvider("pandoc-spec", {
    level: LogLevel.Trace
});

/**
 * Get a logger using parameters loaded by name in pandoc-spec.logger.json.
 *
 * @param name
 * Logger name.
 *
 * @returns
 * Logger.
 */
export function getLogger(name: string): CoreLogger {
    // TODO Point logger to stderr.
    // TODO Support file for trace.
    return provider.getCategory(name);
}
