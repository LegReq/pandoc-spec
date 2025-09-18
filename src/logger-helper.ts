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
