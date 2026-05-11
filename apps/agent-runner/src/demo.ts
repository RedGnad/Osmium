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

    if (sendTransactions) {
      result.transaction = await authorizePayment(config, attempt);
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

