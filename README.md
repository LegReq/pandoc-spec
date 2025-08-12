# Pandoc Specification Builder

This is a [Pandoc](https://pandoc.org/) utility that simplifies the building of technical specifications using Pandoc. Although not definitive, it provides sensible defaults and the ability to generate repeatable results through a configuration file rather than command-line parameters. Any Pandoc options not available through the predefined configuration properties may be specified through the `additionalOptions` property of the configuration file.

In addition, there is a GitHub Action available to automate building the specification, with the option to publish it to GitHub Pages.

## Pre-defined Filters

Four filters are pre-defined and always available:

* include-files
  * Lua filter from the [Pandoc Lua filters repository](https://github.com/pandoc/lua-filters).
  * Allows specifications written in Markdown to include other Markdown files as a way of modularizing a specification.
  * Incorporated directly into this package, but unlikely to be updated at source.
* include-code-files
  * Lua filter from the [Pandoc Lua filters repository](https://github.com/pandoc/lua-filters).
  * Allows specifications written in Markdown to externalize code files (C, JavaScript, JSON, XML, etc.) as a way of modularizing a specification.
  * Incorporated directly into this package, but unlikely to be updated at source.
* pandoc-defref
  * [Pandoc definition reference filter](https://www.npmjs.com/package/@legreq/pandoc-defref)
  * Included as a dependency, so users of this package don't have to rely on this package being updated to get the latest version.
* mermaid-filter
  * [Mermaid filter](https://www.npmjs.com/package/mermaid-filter)
  * Included as a dependency, so users of this package don't have to rely on this package being updated to get the latest version.

## Styling

### Layout

The layout of the default template is as follows:

```text
| container       |
| | header      | |
| | body        | |
| | | toc     | | |
| | | content | | |
| | footer      | |
```

The default template has class names applied to each of its major elements:

* container - The `<div>` element inside the `<body>` element that contains all the other elements.
* header - The `<div>` element for the header as defined in the configuration.
* body - The `<div>` element for the body of document.
* toc - The `<div>` element for the table of contents.
* content - The `<div>` element for the document content.
* footer - The `<div>` element for the footer as defined in the configuration.

Additional styling may be applied to these elements using the `styles` property of the configuration.

### Numbering

Counters have been defined for example and figure numbering. They are automatically reset when the "content" class name is encountered.

Counters may be applied using Pandoc's extended Markdown as follows:

````markdown
[[Example]{.example-number-after} - A TypeScript example]{.example-caption}

```typescript {#a-typescript-example}
// Some example code here.
```
````

The breakdown is as follows:

* An outer block (implemented as `<span>` by Pandoc) with the class name "example-caption".
* An inner block (implemented as `<span>` by Pandoc) with the class name "example-number-after". The block's last element is set to a space followed by the next example number.

The following classes are available for example numbering:

* example-counter-reset - Resets the example counter.
* example-number-after - Places the example number after the block.
* example-number-before - Places the example number before the block.
* example-caption - Basic styling for example captions.

Equivalent classes are available for figures.

## Configuration

| Attribute             | Type     | Required? | Default                  | Description                                                                                                                                                                                                                                                                                                                              |
|-----------------------|----------|-----------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `optionsFile`         | string   | false     | pandoc-spec.options.json | Path of options file. Allows the command-line to specify the an options file other than the default.                                                                                                                                                                                                                                     |
| `debug`               | boolean  | false     | false                    | If true, dumps the input and output directory and the Pandoc command-line to stderr prior to execution.                                                                                                                                                                                                                                  |
| `verbose`             | boolean  | false     | false                    | If true, passes --verbose to Pandoc for verbose output.                                                                                                                                                                                                                                                                                  |
| `autoDate`            | boolean  | false     | false                    | If true, adds a `date` value to the metadata in the format YYYY-MM-DD.                                                                                                                                                                                                                                                                   |
| `inputFormat`         | string   | false     | markdown                 | Input file format.                                                                                                                                                                                                                                                                                                                       |
| `outputFormat`        | string   | false     | html                     | Output file format.                                                                                                                                                                                                                                                                                                                      |
| `shiftHeadingLevelBy` | number   | false     | -1                       | The amount by which to shift the section heading level. A value of -1 takes heading level 1 as the title.                                                                                                                                                                                                                                |
| `numberSections`      | boolean  | false     | true                     | If true, sections are numbered automatically.                                                                                                                                                                                                                                                                                            |
| `generateTOC`         | boolean  | false     | true                     | If true, a table of contents is generated from the headings. There is a predefined variable `toc-header` that sets the header above the table of contents, which defaults to "Table of Contents". This may be overridden, e.g., for localization, or eliminated entirely with an empty string, by using the `variables` option.          |
| `filters`             | object[] | false     | []                       | Zero or more additional filters to be applied to the transformation.                                                                                                                                                                                                                                                                     |
| - `type`              | string   | false     | "lua"                    | Filter type, either "lua" or "json". [Lua](https://www.lua.org/) filters are integrated directly by Pandoc; JSON filters process the JSON AST from stdin and write updated JSON AST to stdout.                                                                                                                                           |
| - `path`              | string   | true      |                          | Either the path to a script for a Lua filter, relative to the _starting_ directory, or an operating system command for a JSON filter. If an operating system command and it contains a path delimiter ('/'), it is assumed to be relative to the _starting_ directory.                                                                   |
| `templateFile`        | string   | false     | (internal)               | The Pandoc template to use in generating the output, relative to the starting directory. If none is provided and `outputFormat` is "html", an internal template ("pandoc/template.html") relative to the _package root directory_ is used.                                                                                               |
| `headerFile`          | string   | false     |                          | A header file to apply to the template, relative to the _starting_ directory.                                                                                                                                                                                                                                                            |
| `footerFile`          | string   | false     |                          | A footer file to apply to the template, relative to the _starting_ directory.                                                                                                                                                                                                                                                            |
| `variables`           | object[] | false     |                          | Variables to be passed to the template file.                                                                                                                                                                                                                                                                                             |
| - `key`               | string   | true      |                          | Variable key.                                                                                                                                                                                                                                                                                                                            |
| - `value`             | string   | false     |                          | Variable value. If not provided, Pandoc interprets it as boolean "true".                                                                                                                                                                                                                                                                 |
| `styles`              | object[] | false     |                          | Styles to be added to the "class" attributes of components in the template file with matching classes.                                                                                                                                                                                                                                   |
| - `name`              | string   | true      |                          | Style name. Valid values for the default template are "container", "header", "body", "toc", "content", and "footer".                                                                                                                                                                                                                     |
| - `className`         | string   | true      |                          | Style class name.                                                                                                                                                                                                                                                                                                                        |
| `inputDirectory`      | string   | false     | .                        | The directory in which the input file or files reside. This will be the working directory while Pandoc is running.                                                                                                                                                                                                                       |
| `inputFiles`          | string[] | true      |                          | One or more input files, relative to the _input_ directory.                                                                                                                                                                                                                                                                              |
| `cssFiles`            | string[] | false     |                          | Zero or more CSS files, relative to the _input_ directory. CSS files are copied to the output directory with their relative paths preserved.                                                                                                                                                                                             |
| `resourceFiles`       | string[] | false     |                          | Zero or more resource files, , relative to the _input_ directory. Resource files may be expressed as [glob patterns](https://en.wikipedia.org/wiki/Glob_(programming)). Resource files are copied to the output directory with their relative paths preserved except where they are absolute, in which case they are copied to the root. |
| `outputDirectory`     | string   | false     |                          | The directory to which the output file will be written and CSS and resource files will be copied.                                                                                                                                                                                                                                        |
| `cleanOutput`         | boolean  | false     |                          | If true, the output directory is cleaned before Pandoc is run for the first time.                                                                                                                                                                                                                                                        |
| `outputFile`          | string   | true      |                          | The name of the output file, relative to the _output_ directory.                                                                                                                                                                                                                                                                         |
| `additionalOptions`   | object[] | false     | []                       | Additional options to be added to the Pandoc command line.                                                                                                                                                                                                                                                                               |
| - `option`            | string   | true      |                          | The option to be added to the Pandoc command line.                                                                                                                                                                                                                                                                                       |
| - `value`             | string   | false     |                          | The value for the option, if any, to be added to the Pandoc command line.                                                                                                                                                                                                                                                                |
| `watch`               | boolean  | false     |                          | If true, the input directory is watched for changes and Pandoc is rerun when detected. Ignored if running inside a GitHub Action.                                                                                                                                                                                                        |
| `watchTemplateFile`   | boolean  | false     |                          | If true, the template file is watched for changes and Pandoc is rerun when detected. Ignored if watch is false.                                                                                                                                                                                                                          |
| `watchWait`           | number   | false     | 2000                     | Time in milliseconds to wait for changes to be fully written before rerunning Pandoc.                                                                                                                                                                                                                                                    |

The Pandoc Specification Builder looks for the file `pandoc-spec.options.json` in the starting directory. If present, this file is expected to be structured according to the above. For example:

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

There are three ways to run the Pandoc Specification Builder: from code, from the command line, or as a GitHub Action. In all cases, the options are built from two sources: the options file (if present) and the options object passed as a parameter. The options file defaults to `pandoc-spec.options.json` in the starting directory, but this may be overridden by setting the `optionsFile` property in the options object passed as a parameter.

### Code

The code option allows options specified in the options file to be overridden. This example enables debugging and verbosity and leaves the rest to `pandoc-spec.options.json`.

```typescript
import { type Options, pandocSpec } from "@legreq/pandoc-spec";

const options: Partial<Options> = {
  debug: true,
  verbose: true
};

pandocSpec(options);
```

### Command Line

The command line is script that takes parameters matching the options properties, using standard command-line syntax.

Given the following in `pandoc-spec.options.json`:

```json
{
  "verbose": true,
  "autoDate": true,
  "inputDirectory": "chapters",
  "cssFile": "css/spec.css",
  "outputDirectory": "_site",
  "cleanOutput": true,
  "outputFile": "index.html"
}
```

The command-line to add the input files and override some of the options could look like this:

```bash
pandoc-spec --debug --no-verbose --input-file "Index.md" \
  --input-file "Introduction.md" --input-file "Use Cases.md" \
  --input-file "ABNF.md" --input-file "Specification.md" \
  --input-file "References.md"  --input-file "Appendix.md"
  --output-directory "test" --watch
```

Note the following:

* All options are in lower-case with hyphen separators and are preceded by two hyphens.
* Boolean options are enabled by their name, disabled by "no-" followed by their name.
* Options that take arrays may be repeated, and the resulting arrays will be in the same order as on the command-line.
* Two additional options are available:
  * "--help" shows the command-line syntax.
  * "--version" displays the current version.

### GitHub Action

The GitHub Action runs within a workflow. If `package.json` exists and the script `pandoc-spec-action` is defined within it, the Pandoc Specification Builder will be called via `npm run pandoc-spec-action`; otherwise, it will be called via `pandoc-spec`.

The GitHub Action is available at `legreq/pandoc-spec@v1` and defines the following input parameters:

* `include-repository`
  * If true, includes node setup, repository checkout, and npm install. Default is false.
* `node-version`
  * Version of node to be installed; ignored if `include-repository` is false. Default is environment-defined.
* `include-pages`
  * If true, includes publication to GitHub Pages. Default is false. 
* `pages-path`
  * Path of the output directory containing the GitHub Pages content; ignored if `include-pages` is false. Default is "_site/".

The following workflow, when installed in .github/workflows, will be triggered on any push to the `main` branch. It will set up node, check out the repository, run `npm install`, build the specification, and publish it to GitHub Pages.

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
      - name: Pandoc Specification Builder
        uses: legreq/pandoc-spec@v1
        with:
          include-repository: true
          include-pages: true
```
