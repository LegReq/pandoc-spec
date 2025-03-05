# Pandoc Specification Builder

This is a [Pandoc](https://pandoc.org/) utility that simplifies the building of technical specifications using Pandoc.
Although not definitive, it provides sensible defaults and the ability to generate repeatable results through a
configuration file rather than command-line parameters. Any Pandoc options not available through the predefined
configuration properties may be specified through the `additionalOptions` property of the configuration file.

In addition, there is a GitHub Action available to automate building the specification, with the option to publish it to
GitHub Pages.

## Pre-defined Filters

Four filters are pre-defined and always available:

* include-files
  * Lua filter from the [Pandoc Lua filters repository](https://github.com/pandoc/lua-filters).
  * Allows specifications written in Markdown to include other Markdown files as a way of modularizing a specification.
  * Incorporated directly into this package, but unlikely to be updated at source.
* include-code-files
  * Lua filter from the [Pandoc Lua filters repository](https://github.com/pandoc/lua-filters).
  * Allows specifications written in Markdown to externalize code files (C, JavaScript, JSON, XML, etc.) as a way of
    modularizing a specification.
  * Incorporated directly into this package, but unlikely to be updated at source.
* pandoc-defref
  * [Pandoc definition reference filter](https://www.npmjs.com/package/@legreq/pandoc-defref)
  * Included as a dependency, so users of this package don't have to rely on this package being updated to get the
    latest version.
* mermaid-filter
  * [Mermaid filter](https://www.npmjs.com/package/mermaid-filter)
  * Included as a dependency, so users of this package don't have to rely on this package being updated to get the
    latest version.

## Configuration

| Attribute             | Type               | Required? | Default    | Description                                                                                                                                                                                                                                                                                                                                               |
|-----------------------|--------------------|-----------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `debug`               | boolean            | false     | false      | If true, dumps the input and output directory and the Pandoc command-line to stderr prior to execution.                                                                                                                                                                                                                                                   |
| `verbose`             | boolean            | false     | false      | If true, passes --verbose to Pandoc for verbose output.                                                                                                                                                                                                                                                                                                   |
| `autoDate`            | boolean            | false     | false      | If true, adds a `date` value to the metadata in the format YYYY-MM-DD.                                                                                                                                                                                                                                                                                    |
| `inputFormat`         | string             | false     | markdown   | Input file format.                                                                                                                                                                                                                                                                                                                                        |
| `outputFormat`        | string             | false     | html       | Output file format.                                                                                                                                                                                                                                                                                                                                       |
| `shiftHeadingLevelBy` | number             | false     | -1         | The amount by which to shift the section heading level. A value of -1 takes heading level 1 as the title.                                                                                                                                                                                                                                                 |
| `numberSections`      | boolean            | false     | true       | If true, sections are numbered automatically.                                                                                                                                                                                                                                                                                                             |
| `generateTOC`         | boolean            | false     | true       | If true, a table of contents is generated from the headings.                                                                                                                                                                                                                                                                                              |
| `filters`             | object[]           | false     | []         | Zero or more additional filters to be applied to the transformation.                                                                                                                                                                                                                                                                                      |
| - `type`              | string             | false     | "lua"      | Filter type, either "lua" or "json". [Lua](https://www.lua.org/) filters are integrated directly by Pandoc; JSON filters process the JSON AST from stdin and write updated JSON AST to stdout.                                                                                                                                                            |
| - `path`              | string             | true      |            | Either the path to a script for a Lua filter, relative to the _starting_ directory, or an operating system command for a JSON filter. If an operating system command and it contains a path delimiter ('/'), it is assumed to be relative to the _starting_ directory.                                                                                    |
| `templateFile`        | string             | false     | (internal) | The Pandoc template to use in generating the output, relative to the starting directory. If none is provided and `outputFormat` is "html", an internal template ("pandoc/template.html") relative to the _package root directory_ is used.                                                                                                                |
| `headerFile`          | string             | false     |            | A header file to apply to the template, relative to the _starting_ directory.                                                                                                                                                                                                                                                                             |
| `footerFile`          | string             | false     |            | A footer file to apply to the template, relative to the _starting_ directory.                                                                                                                                                                                                                                                                             |
| `inputDirectory`      | string             | false     | .          | The directory in which the input file or files reside. This will be the working directory while Pandoc is running.                                                                                                                                                                                                                                        |
| `inputFile`           | string \| string[] | true      |            | One or more input files, either a single string (one input file) or an array of strings (multiple input files), relative to the _input_ directory.                                                                                                                                                                                                        |
| `cssFile`             | string \| string[] | false     |            | Zero or more CSS files, either a single string (one CSS file) or an array of strings (multiple CSS files), relative to the _input_ directory. CSS files are copied to the output directory with their relative paths preserved.                                                                                                                           |
| `resourceFile`        | string \| string[] | false     |            | Zero or more resource files, either a single string (one resource file) or an array of strings (multiple resource files), relative to the _input_ directory. Resource files may be expressed as [glob patterns](https://en.wikipedia.org/wiki/Glob_(programming)). Resource files are copied to the output directory with their relative paths preserved. |
| `outputDirectory`     | string             | false     |            | The directory to which the output file will be written and CSS and resource files will be copied.                                                                                                                                                                                                                                                         |
| `cleanOutput`         | boolean            | false     |            | If true, the output directory is cleaned before Pandoc is run. Doing so may interfere with development tools such as webpack that watch for changes and refresh the browser if changes are detected, causing a 404 error while the build is going on.                                                                                                     |
| `outputFile`          | string             | true      |            | The name of the output file, relative to the _output_ directory.                                                                                                                                                                                                                                                                                          |
| `additionalOptions`   | object[]           | false     | []         | Additional options to be added to the Pandoc command line.                                                                                                                                                                                                                                                                                                |
| - `option`            | string             | true      |            | The option to be added to the Pandoc command line.                                                                                                                                                                                                                                                                                                        |
| - `value`             | string             | false     |            | The value for the option, if any, to be added to the Pandoc command line.                                                                                                                                                                                                                                                                                 |

The Pandoc specification builder looks for the file `pandoc-spec.options.json` in the starting directory. If present, this file is expected to be structured according to the above. For example:

```json
{
  "verbose": true,
  "autoDate": true,
  "inputDirectory": "chapters",
  "inputFile": [
    "Index.md",
    "Introduction.md",
    "Use Cases.md",
    "ABNF.md",
    "Specification.md",
    "References.md",
    "Appendix.md"
  ],
  "cssFile": "css/spec.css",
  "outputDirectory": "_site",
  "cleanOutput": true,
  "outputFile": "index.html"
}
```

## Running the Builder

There are three ways to run the Pandoc specification builder: from code, from the command line, or as a GitHub Action.
In all cases, it looks for `pandoc-spec.options.json` in the starting directory.

### Code

The code option allows options specified in the configuration to be overridden. This enables debugging and leaves the
rest to `pandoc-spec.options.json`.

```typescript
import { exec, type Options } from "@legreq/pandoc-spec";

const options: Partial<Options> = {
    debug: true
};

exec(options);
```

### Command line

The command line is a simple binary that takes no parameters. To run it, call `pandoc-spec`.

### GitHub Action

The GitHub Action runs within a workflow. If `package.json` exists and the script `pandoc-spec` is defined within it,
the Pandoc specification builder will be called via `npm run pandoc-spec`; otherwise, it will be called via
`pandoc-spec`.

The GitHub Action is available at `legreq/pandoc-spec@v1` and defines the following input parameters:

* `include-repository`
  * If true, includes node setup, repository checkout, and npm install. Default is false.
* `node-version`
  * Version of node to be installed; ignored if `include-repository` is false. Default is environment-defined.
* `include-pages`
  * If true, includes publication to GitHub Pages. Default is false. 
* `pages-path`
  * Path of the output directory containing the GitHub Pages content; ignored if `include-pages` is false. Default is
    "_site/".

The following workflow, when installed in .github/workflows, will be triggered on any push to the `main` branch. It will
set up node, check out the repository, run `npm install`, build the specification, and publish it to GitHub Pages.

```yaml
name: Push to main

on:
  push:
    branches:
      - main

permissions:
  id-token: write
  pages: write

jobs:
  push:
    runs-on: ubuntu-latest

    steps:
      - name: Pandoc specification builder
        uses: legreq/pandoc-spec@v1
        with:
          include-repository: true
          include-pages: true
```
