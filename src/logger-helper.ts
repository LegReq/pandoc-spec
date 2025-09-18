import { LogLevel } from "typescript-logging";
import { type Category, CategoryProvider, type CategoryRuntimeSettings } from "typescript-logging-category-style";

/**
 * Logger. Type alias for {@link Category}.
 */
export type Logger = Category;

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
export function getLogger(name: string): Logger {
    // TODO Support configuration.
    return provider.getCategory(name);
}

/**
 * Update a logger.
 *
 * @param logger
 * Logger.
 *
 * @param settings
 * Logger settings.
 */
export function updateLogger(logger: Logger, settings: CategoryRuntimeSettings): void {
    provider.updateRuntimeSettingsCategory(logger, settings);
}
