/** How much of a rule the system resolves; what is not automated stays text for the DM. */
export type Automation = "full" | "partial" | "manual";
/** Whether the rule needs the SRD attribution. */
export type Source = "srd" | "srd-modified" | "original";

export type RuleMeta = { automation: Automation; source: Source };
