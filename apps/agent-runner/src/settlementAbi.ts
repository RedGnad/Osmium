export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export const settlementRouterAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "settleWithIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "uint256" },
      { name: "intentHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "paymentId", type: "bytes32" },
      { name: "receiptHash", type: "bytes32" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "vaultBalance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "event",
    name: "PaymentSettled",
    inputs: [
      { name: "policyId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "paymentId", type: "bytes32", indexed: false },
      { name: "intentHash", type: "bytes32", indexed: false },
      { name: "receiptHash", type: "bytes32", indexed: false }
    ]
  }
] as const;
