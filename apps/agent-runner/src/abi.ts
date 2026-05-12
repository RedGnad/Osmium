export const osmiumPolicyEngineAbi = [
  {
    type: "function",
    name: "init",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  },
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "nextPolicyId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "registerMerchant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchant_address", type: "address" },
      { name: "category", type: "bytes32" },
      { name: "metadata_hash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "createPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "token", type: "address" },
      { name: "max_per_tx", type: "uint256" },
      { name: "period_limit", type: "uint256" },
      { name: "period_seconds", type: "uint64" },
      { name: "valid_until", type: "uint64" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approveIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "intent_hash", type: "bytes32" },
      { name: "context_hash", type: "bytes32" },
      { name: "max_amount", type: "uint256" },
      { name: "valid_until", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "previewAuthorizationWithIntent",
    stateMutability: "view",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "intent_hash", type: "bytes32" },
      { name: "context_hash", type: "bytes32" },
      { name: "agent", type: "address" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "payment_id", type: "bytes32" },
      { name: "receipt_hash", type: "bytes32" }
    ],
    outputs: [{ type: "bool" }, { type: "uint8" }]
  },
  {
    type: "function",
    name: "authorizePaymentWithIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "intent_hash", type: "bytes32" },
      { name: "context_hash", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "payment_id", type: "bytes32" },
      { name: "receipt_hash", type: "bytes32" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export const blockReasons: Record<number, string> = {
  0: "None",
  1: "PolicyInactive",
  2: "UnauthorizedAgent",
  3: "UnknownMerchant",
  4: "TokenNotAllowed",
  5: "OverMaxTx",
  6: "OverBudget",
  7: "Expired",
  8: "Replay",
  9: "MissingReceipt",
  10: "InvalidIntent",
  11: "IntentExpired",
  12: "IntentAmountExceeded",
  13: "ContextMismatch"
};
