import { loadConfig } from "./config.js";
import { authorizePayment, demoAttempts, previewAuthorization } from "./osmium.js";

export async function runDemo({ sendTransactions }: { sendTransactions: boolean }) {
  const config = loadConfig();
  const attempts = demoAttempts(config);
  const results = [];

  for (const attempt of attempts) {
    const preview = await previewAuthorization(config, attempt);
    const result: Record<string, unknown> = {
      label: attempt.label,
      preview
    };

    if (!sendTransactions && attempt.label === "blocked replay") {
      result.note = "Replay is enforced after the first state-changing authorization consumes the payment id.";
    }

    if (sendTransactions) {
      try {
        result.transaction = await authorizePayment(config, attempt);
      } catch (error) {
        result.transactionError = error instanceof Error ? error.message : String(error);
      }
    }

    results.push(result);
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sendTransactions = process.argv.includes("--send");
  runDemo({ sendTransactions })
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
