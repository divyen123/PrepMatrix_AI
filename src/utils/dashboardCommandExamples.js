import { resolveHomeNavigationCommand } from "./homeNavigationCommands.js";

const DASHBOARD_COMMAND_EXAMPLES = Object.freeze([
  { command: "go to materials", route: "/resources" },
  { command: "go to subjects", route: "/subjects" },
  { command: "open planner", route: "/planner" },
  { command: "start learning", route: "/learn" },
]);

export function getDashboardCommandExampleCopy(availableRoutes) {
  const availableExamples = DASHBOARD_COMMAND_EXAMPLES.filter(({ command, route }) => (
    resolveHomeNavigationCommand(command, { availableRoutes })?.route === route
  ));
  const primary = availableExamples[0];
  const planner = availableExamples.find(({ route }) => route === "/planner");
  const secondary = planner && planner !== primary
    ? planner
    : availableExamples.find((example) => example !== primary);

  if (!primary) {
    return {
      helper: "Ask a study question or type the name of an available page.",
      placeholder: "Ask your AI study assistant...",
    };
  }

  return {
    helper: secondary
      ? `Try "${primary.command}", "${secondary.command}", or ask a study question.`
      : `Try "${primary.command}" or ask a study question.`,
    placeholder: `Ask AI or type '${primary.command}'...`,
  };
}
