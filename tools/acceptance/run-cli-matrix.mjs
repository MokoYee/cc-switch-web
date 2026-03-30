import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenarioFilePath = resolve(__dirname, "cli-matrix-scenarios.json");

const parseArgs = (argv) => {
  const options = {
    app: undefined,
    scenario: undefined,
    format: "markdown",
    list: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--app") {
      options.app = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--scenario") {
      options.scenario = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--format") {
      options.format = argv[index + 1] ?? "markdown";
      index += 1;
      continue;
    }
    if (current === "--list") {
      options.list = true;
    }
  }

  return options;
};

const data = JSON.parse(readFileSync(scenarioFilePath, "utf-8"));
const options = parseArgs(process.argv);

const apps = data.apps.filter((item) =>
  options.app === undefined ? true : item.appCode === options.app
);
const scenarios = data.scenarios.filter((item) =>
  options.scenario === undefined ? true : item.id === options.scenario
);

if (apps.length === 0) {
  throw new Error(`Unknown app code: ${options.app}`);
}

if (scenarios.length === 0) {
  throw new Error(`Unknown scenario id: ${options.scenario}`);
}

if (options.list) {
  console.log(
    JSON.stringify(
      {
        apps: data.apps.map((item) => ({
          appCode: item.appCode,
          status: item.status,
          supportedTakeoverModes: item.supportedTakeoverModes
        })),
        scenarios: data.scenarios.map((item) => ({
          id: item.id,
          title: item.title
        }))
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (options.format === "json") {
  console.log(
    JSON.stringify(
      {
        version: data.version,
        apps,
        scenarios
      },
      null,
      2
    )
  );
  process.exit(0);
}

const printChecklist = () => {
  console.log(`# CLI Compatibility Checklist`);
  console.log("");
  console.log(`- Matrix Version: ${data.version}`);
  console.log(`- Scenario Count: ${scenarios.length}`);
  console.log("");

  for (const app of apps) {
    console.log(`## ${app.appCode}`);
    console.log("");
    console.log(`- Binary: \`${app.binary}\``);
    console.log(`- Status: \`${app.status}\``);
    console.log(
      `- Supported Takeover Modes: ${
        app.supportedTakeoverModes.length === 0
          ? "`none`"
          : app.supportedTakeoverModes.map((item) => `\`${item}\``).join(", ")
      }`
    );
    console.log(`- Acceptance Setup:`);
    console.log(`  - \`ccsw host scan\``);
    if (app.supportedTakeoverModes.includes("file-rewrite")) {
      console.log(`  - \`ccsw host preview ${app.appCode} --mode file-rewrite\``);
      console.log(`  - \`ccsw host apply ${app.appCode} --mode file-rewrite\``);
    }
    if (app.supportedTakeoverModes.includes("environment-override")) {
      console.log(`  - \`ccsw host preview ${app.appCode} --mode environment-override\``);
      console.log(`  - \`ccsw host apply ${app.appCode} --mode environment-override\``);
      console.log(`  - Source the activation command returned by the apply result in the target shell.`);
    }
    console.log(`  - \`ccsw logs requests --app ${app.appCode} --limit 20\``);
    console.log(`  - \`ccsw health probe <providerId>\``);
    console.log("");
    console.log(`- App Notes:`);
    for (const note of app.notes) {
      console.log(`  - ${note}`);
    }
    console.log("");
    console.log(`### Scenarios`);
    console.log("");

    for (const scenario of scenarios) {
      console.log(`- [ ] ${scenario.id} / ${scenario.title}`);
      for (const expected of scenario.expected) {
        console.log(`  - ${expected}`);
      }
    }

    console.log("");
  }
};

printChecklist();
