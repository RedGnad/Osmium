/*
 * Three templates, one real.
 *
 * - TSLA-strict (active)  → uses the Stylus PolicyEngine defaults wired into
 *   the OnboardingWizard. Real onchain code path.
 * - AMD-strict (coming soon) → would mirror TSLA-strict for AMD. Disabled
 *   because the runner currently only ships TSLA live settlement; we want
 *   to ship V2 with the matching AMD live receipt before flipping this on.
 * - Custom policy (coming soon) → editable policy parameters; not built
 *   yet because the wizard doesn't expose Stylus inputs beyond the defaults.
 *
 * The two "coming soon" cards are visibly disabled, exactly per the
 * integrity rules: we don't fake choice.
 */
import { Check } from "lucide-react";

type Template = {
  id: "tsla-strict" | "amd-strict" | "custom";
  title: string;
  subtitle: string;
  maxPerTx: string;
  periodLimit: string;
  state: "active" | "soon";
  detail: string;
};

const templates: Template[] = [
  {
    id: "tsla-strict",
    title: "TSLA strict",
    subtitle: "Osmium template · live",
    maxPerTx: "1.00 TSLA",
    periodLimit: "10.00 TSLA / 24h",
    state: "active",
    detail:
      "Operator-friendly defaults. The wizard provisions this exact policy onchain.",
  },
  {
    id: "amd-strict",
    title: "AMD strict",
    subtitle: "coming soon",
    maxPerTx: "1.00 AMD",
    periodLimit: "10.00 AMD / 24h",
    state: "soon",
    detail: "Ships once AMD live settlement lands. Quote-supported today.",
  },
  {
    id: "custom",
    title: "Custom policy",
    subtitle: "coming soon",
    maxPerTx: "your call",
    periodLimit: "your call",
    state: "soon",
    detail:
      "Edit max-per-tx, period limit and validity from the dashboard. V2.",
  },
];

export function PolicyTemplatePicker() {
  return (
    <section
      className="templatePicker"
      aria-label="Policy templates"
      role="radiogroup"
    >
      <header className="templatePickerHead">
        <span className="templatePickerEyebrow">Policy template</span>
        <h3>
          One real template today. <em>More flexibility is coming.</em>
        </h3>
      </header>
      <div className="templateGrid">
        {templates.map((t) => (
          <div
            key={t.id}
            className={`templateCard ${t.state}`}
            role="radio"
            aria-checked={t.state === "active"}
            aria-disabled={t.state === "soon"}
            tabIndex={t.state === "active" ? 0 : -1}
          >
            <div className="templateCardHead">
              <strong>{t.title}</strong>
              <span className="templateCardTag">
                {t.state === "active" ? (
                  <>
                    <Check size={11} strokeWidth={3} /> selected
                  </>
                ) : (
                  t.subtitle
                )}
              </span>
            </div>
            <dl className="templateCardMeta">
              <div>
                <dt>Max / tx</dt>
                <dd>{t.maxPerTx}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{t.periodLimit}</dd>
              </div>
            </dl>
            <p className="templateCardDetail">{t.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
