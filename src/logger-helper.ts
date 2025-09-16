import { LogLevel } from "typescript-logging";
import { type Category, CategoryProvider, type CategoryRuntimeSettings } from "typescript-logging-category-style";

/**
 * Logger. Type alias for {@link Category}.
 */
export type Logger = Category;

const provider = CategoryProvider.createProvider("pandoc-spec", {
    level: LogLevel.Trace,
    channel: {
        type: "LogChannel",
        write: (msg) => {
            process.stderr.write(`${msg.message}\n`);

            if (msg.error !== undefined) {
                process.stderr.write(`${msg.error}\n`);
            }
        }
    }
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
    // TODO Support file for trace.
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
