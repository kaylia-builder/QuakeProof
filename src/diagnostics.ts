export const EXPECTED_PAYMENT = {
  x402Version: 2,
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "10000"
} as const;

type JsonRecord = Record<string, unknown>;

export interface DiagnosticInput {
  healthStatus: number;
  challengeStatus: number;
  paymentRequired: unknown;
  supportedStatus: number;
  supported: unknown;
}

export interface DiagnosticCheck {
  name: string;
  status: "pass" | "fail" | "not_tested";
  detail: string;
}

function record(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonRecord;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .filter((item): item is JsonRecord => item !== undefined);
}

function supportedKinds(value: unknown): JsonRecord[] {
  const object = record(value);
  if (!object) return [];
  return records(object.kinds ?? object.supportedKinds);
}

export function sanitizeForReport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  const object = record(value);
  if (!object) return value;

  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [
      key,
      /(private|secret|signature|authorization|credential|bearer|token)/i.test(key)
        ? "[REDACTED]"
        : sanitizeForReport(item)
    ])
  );
}

export function analyzeDiagnostics(input: DiagnosticInput): {
  outcome: "pass" | "fail";
  checks: DiagnosticCheck[];
} {
  const paymentRequired = record(input.paymentRequired);
  const accepts = records(paymentRequired?.accepts);
  const requirement = accepts.find(item =>
    item.scheme === EXPECTED_PAYMENT.scheme &&
    item.network === EXPECTED_PAYMENT.network
  );
  const kinds = supportedKinds(input.supported);
  const facilitatorKind = kinds.find(item =>
    item.scheme === EXPECTED_PAYMENT.scheme &&
    item.network === EXPECTED_PAYMENT.network &&
    (item.x402Version === undefined || item.x402Version === EXPECTED_PAYMENT.x402Version)
  );

  const checks: DiagnosticCheck[] = [
    {
      name: "service_health",
      status: input.healthStatus === 200 ? "pass" : "fail",
      detail: `health endpoint returned HTTP ${input.healthStatus}`
    },
    {
      name: "payment_challenge",
      status: input.challengeStatus === 402 && paymentRequired ? "pass" : "fail",
      detail: paymentRequired
        ? `paid endpoint returned HTTP ${input.challengeStatus} with a decodable challenge`
        : `paid endpoint returned HTTP ${input.challengeStatus} without a decodable challenge`
    },
    {
      name: "payment_terms",
      status:
        requirement &&
        paymentRequired?.x402Version === EXPECTED_PAYMENT.x402Version &&
        string(requirement.asset)?.toLowerCase() === EXPECTED_PAYMENT.asset.toLowerCase() &&
        string(requirement.amount) === EXPECTED_PAYMENT.amount
          ? "pass"
          : "fail",
      detail: requirement
        ? `challenge advertises ${String(requirement.amount)} units of ${String(requirement.asset)} on ${String(requirement.network)}`
        : "challenge does not advertise the expected Base Sepolia USDC requirement"
    },
    {
      name: "facilitator_capability",
      status: input.supportedStatus === 200 && facilitatorKind ? "pass" : "fail",
      detail: facilitatorKind
        ? "facilitator advertises exact payments on eip155:84532"
        : `facilitator returned HTTP ${input.supportedStatus} without the expected EVM capability`
    },
    {
      name: "settlement_compatibility",
      status: "not_tested",
      detail: "read-only diagnostics cannot prove asset-specific verification or settlement"
    }
  ];

  return {
    outcome: checks.some(check => check.status === "fail") ? "fail" : "pass",
    checks
  };
}
