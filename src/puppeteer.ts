import fs from "fs";
import path from "node:path";

/**
 * Configuration layout of .puppeteer.json (relevant attributes only).
 */
interface Configuration {
    /**
     * Arguments.
     */
    args?: string[] | undefined;
}

/**
 * Configuration state.
 */
enum State {
    NotFound,
    FromWorking,
    FromInputComplete,
    FromInputPartial
}

/**
 * Puppeteer configurator. Looks for Puppeteer configuration file in input directory, then in working directory, and
 * ensures that the --no-sandbox argument is set.
 */
export class PuppeteerConfigurator {
    /**
     * Configuration state; required to restore original Puppeteer configuration file in input directory.
     */
    private readonly _state: State;

    /**
     * Input configuration file.
     */
    private readonly _inputConfigurationFile: string;

    /**
     * Configuration file content to be restored.
     */
    private readonly _configurationFileContent: string;

    /**
     * Constructor.
     *
     * @param inputDirectory
     * Input directory in which Pandoc will be run.
     */
    constructor(inputDirectory: string) {
        const configurationFile = ".puppeteer.json";

        this._inputConfigurationFile = path.resolve(inputDirectory, configurationFile);

        const workingConfigurationFile = path.resolve(configurationFile);

        if (fs.existsSync(this._inputConfigurationFile)) {
            this._state = State.FromInputPartial;

            this._configurationFileContent = fs.readFileSync(this._inputConfigurationFile).toString();
        } else if (fs.existsSync(workingConfigurationFile)) {
            this._state = State.FromWorking;

            this._configurationFileContent = fs.readFileSync(workingConfigurationFile).toString();
        } else {
            this._state = State.NotFound;

            // Default to empty object.
            this._configurationFileContent = "{}";
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Puppeteer configuration format is known.
        const configuration: Configuration = JSON.parse(this._configurationFileContent);

        // Check for existence of args attribute.
        if (configuration.args === undefined) {
            configuration.args = [];
        }

        // --no-sandbox is required in GitHub Actions due to issues in Ubuntu (https://github.com/puppeteer/puppeteer/issues/12818).
        const noSandboxArg = "--no-sandbox";

        // Check for existence of --no-sandbox argument.
        if (!configuration.args.includes(noSandboxArg)) {
            configuration.args.push(noSandboxArg);
        } else if (this._state === State.FromInputPartial) {
            // Configuration is from input directory and is complete.
            this._state = State.FromInputComplete;
        }

        // Skip if configuration file in input directory exists and already has the --no-sandbox argument.
        if (this._state !== State.FromInputComplete) {
            fs.writeFileSync(this._inputConfigurationFile, `${JSON.stringify(configuration, null, 2)}\n`);
        }
    }

    /**
     * Finalize by restoring original Puppeteer configuration file in input directory.
     */
    finalize(): void {
        switch (this._state) {
            case State.NotFound:
            case State.FromWorking:
                // No original Puppeteer configuration file; delete.
                fs.rmSync(this._inputConfigurationFile);
                break;

            case State.FromInputPartial:
                // Restore original Puppeteer configuration file.
                fs.writeFileSync(this._inputConfigurationFile, this._configurationFileContent);
                break;

            case State.FromInputComplete:
                // Keep original Puppeteer configuration file.
                break;
        }
    }
}
