# Demo Script

## 90 Second Judge Flow

1. Open Osmium dashboard.
2. Show user vault balance.
3. Create policy:
   - Agent: demo agent address
   - Token: USDG/mock USDC
   - Max per tx: 10
   - Period budget: 25 per day
   - Merchant: verified API/data provider
   - Receipt required: yes
4. Run agent payment to verified merchant with receipt hash.
5. Show `PaymentApproved`.
6. Run agent payment to unknown merchant.
7. Show `PaymentBlocked` with `UnknownMerchant`.
8. Run overspend attempt.
9. Show `PaymentBlocked` with `OverMaxTx` or `OverBudget`.
10. Replay the approved payment id.
11. Show `PaymentBlocked` with `Replay`.

## Core Pitch

Osmium is not an AI wallet. It is an onchain policy firewall that lets autonomous agents spend safely through enforceable budget, merchant, receipt, and replay rules.

