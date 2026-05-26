import { loadConfig } from "./config.js";
import { runAttackMode, type AgentAttemptReport } from "./agentLoop.js";

const expectedVerdicts: Record<string, AgentAttemptReport["finalStatus"]> = {
  A: "Cleared",
  B: "Denied",
  C: "Denied",
  D: "Denied",
  E: "Denied",
  F: "Denied"
};

function assertAttempt(attempts: AgentAttemptReport[], id: string) {
  const attempt = attempts.find((item) => item.id === id);
  if (!attempt) throw new Error(`Missing attack-mode case ${id}`);
  const expected = expectedVerdicts[id];
  if (attempt.finalStatus !== expected) {
    throw new Error(
      `Case ${id} expected ${expected}, got ${attempt.finalStatus} (${attempt.reasonName})`
    );
  }
  return attempt;
}

const report = await runAttackMode(loadConfig());
const rows = Object.keys(expectedVerdicts).map((id) => {
  const attempt = assertAttempt(report.attempts, id);
  return {
    case: id,
    verdict: attempt.finalStatus,
    reason: attempt.reasonName,
    fundsMoved: attempt.fundsMoved
  };
});

console.table(rows);
console.log("Agent attack smoke passed: valid mandate clears, unsafe attempts are denied.");
