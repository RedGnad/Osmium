import { runExternalAgentDemo } from "./agent.js";

const report = await runExternalAgentDemo();
const failed = report.cases.filter((testCase) => !testCase.passed);

if (failed.length > 0) {
  console.table(report.cases);
  throw new Error(`External agent proof failed: ${failed.map((testCase) => testCase.case).join(", ")}`);
}

console.table(report.cases);
console.log(`External agent proof passed with settlement tx ${report.proofTx}`);
