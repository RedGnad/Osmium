// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "../src/MockERC20.sol";
import {OsmiumPolicyVault} from "../src/OsmiumPolicyVault.sol";

contract AgentCaller {
    function execute(
        OsmiumPolicyVault vault,
        uint256 policyId,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool) {
        return vault.executePayment(policyId, merchant, token, amount, paymentId, receiptHash);
    }

    function executeWithIntent(
        OsmiumPolicyVault vault,
        uint256 policyId,
        bytes32 intentHash,
        bytes32 contextHash,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool) {
        return vault.executePaymentWithIntent(policyId, intentHash, contextHash, merchant, token, amount, paymentId, receiptHash);
    }
}

contract OsmiumPolicyVaultTest {
    MockERC20 private token;
    OsmiumPolicyVault private vault;
    AgentCaller private agent;

    address private merchant = address(0xBEEF);
    address private unknownMerchant = address(0xBAD);

    function setUp() public {
        token = new MockERC20("Mock USDG", "USDG", 18);
        vault = new OsmiumPolicyVault();
        agent = new AgentCaller();

        token.mint(address(this), 1_000 ether);
        token.approve(address(vault), type(uint256).max);
        vault.registerMerchant(merchant, keccak256("api-data"), keccak256("merchant-metadata"));
        vault.deposit(address(token), 100 ether);
    }

    function testAllowsVerifiedMerchantWithReceipt() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);

        bool ok = agent.execute(
            vault, policyId, merchant, address(token), 8 ether, keccak256("payment-1"), keccak256("receipt-1")
        );

        require(ok, "PAYMENT_BLOCKED");
        require(token.balanceOf(merchant) == 8 ether, "MERCHANT_BALANCE");
    }

    function testBlocksUnknownMerchant() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);

        bool ok = agent.execute(
            vault,
            policyId,
            unknownMerchant,
            address(token),
            8 ether,
            keccak256("payment-unknown"),
            keccak256("receipt-unknown")
        );

        require(!ok, "UNKNOWN_MERCHANT_ALLOWED");
        require(token.balanceOf(unknownMerchant) == 0, "UNKNOWN_MERCHANT_PAID");
    }

    function testBlocksReplay() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);
        bytes32 paymentId = keccak256("payment-replay");

        bool first =
            agent.execute(vault, policyId, merchant, address(token), 5 ether, paymentId, keccak256("receipt-replay"));
        bool second =
            agent.execute(vault, policyId, merchant, address(token), 5 ether, paymentId, keccak256("receipt-replay-2"));

        require(first, "FIRST_BLOCKED");
        require(!second, "REPLAY_ALLOWED");
        require(token.balanceOf(merchant) == 5 ether, "REPLAY_PAID");
    }

    function testBlocksPeriodBudget() public {
        uint256 policyId = _createPolicy(10 ether, 15 ether);

        bool first = agent.execute(
            vault,
            policyId,
            merchant,
            address(token),
            10 ether,
            keccak256("payment-budget-1"),
            keccak256("receipt-budget-1")
        );
        bool second = agent.execute(
            vault,
            policyId,
            merchant,
            address(token),
            10 ether,
            keccak256("payment-budget-2"),
            keccak256("receipt-budget-2")
        );

        require(first, "FIRST_BLOCKED");
        require(!second, "BUDGET_ALLOWED");
        require(token.balanceOf(merchant) == 10 ether, "BUDGET_PAID");
    }

    function testBlocksMissingReceipt() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);

        bool ok = agent.execute(
            vault, policyId, merchant, address(token), 5 ether, keccak256("payment-missing-receipt"), bytes32(0)
        );

        require(!ok, "MISSING_RECEIPT_ALLOWED");
        require(token.balanceOf(merchant) == 0, "MISSING_RECEIPT_PAID");
    }

    function testAllowsPreApprovedIntent() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);
        bytes32 intentHash = keccak256("intent-safe-api-call");
        bytes32 contextHash = keccak256("task:api-data");
        vault.approveIntent(policyId, intentHash, contextHash, 6 ether, uint64(block.timestamp + 1 days));

        bool ok = agent.executeWithIntent(
            vault,
            policyId,
            intentHash,
            contextHash,
            merchant,
            address(token),
            5 ether,
            keccak256("payment-intent-ok"),
            keccak256("receipt-intent-ok")
        );

        require(ok, "INTENT_PAYMENT_BLOCKED");
        require(token.balanceOf(merchant) == 5 ether, "INTENT_MERCHANT_BALANCE");
    }

    function testBlocksMissingIntent() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);

        bool ok = agent.executeWithIntent(
            vault,
            policyId,
            keccak256("missing-intent"),
            keccak256("task:api-data"),
            merchant,
            address(token),
            5 ether,
            keccak256("payment-missing-intent"),
            keccak256("receipt-missing-intent")
        );

        require(!ok, "MISSING_INTENT_ALLOWED");
        require(token.balanceOf(merchant) == 0, "MISSING_INTENT_PAID");
    }

    function testBlocksIntentAmountExceeded() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);
        bytes32 intentHash = keccak256("intent-low-cap");
        bytes32 contextHash = keccak256("task:low-cap");
        vault.approveIntent(policyId, intentHash, contextHash, 3 ether, uint64(block.timestamp + 1 days));

        bool ok = agent.executeWithIntent(
            vault,
            policyId,
            intentHash,
            contextHash,
            merchant,
            address(token),
            4 ether,
            keccak256("payment-intent-over"),
            keccak256("receipt-intent-over")
        );

        require(!ok, "INTENT_OVERAGE_ALLOWED");
        require(token.balanceOf(merchant) == 0, "INTENT_OVERAGE_PAID");
    }

    function testBlocksWrongContextHash() public {
        uint256 policyId = _createPolicy(10 ether, 25 ether);
        bytes32 intentHash = keccak256("intent-bound-context");
        vault.approveIntent(
            policyId, intentHash, keccak256("task:trusted-context"), 6 ether, uint64(block.timestamp + 1 days)
        );

        bool ok = agent.executeWithIntent(
            vault,
            policyId,
            intentHash,
            keccak256("task:prompt-injected-context"),
            merchant,
            address(token),
            5 ether,
            keccak256("payment-wrong-context"),
            keccak256("receipt-wrong-context")
        );

        require(!ok, "WRONG_CONTEXT_ALLOWED");
        require(token.balanceOf(merchant) == 0, "WRONG_CONTEXT_PAID");
    }

    function _createPolicy(uint256 maxPerTx, uint256 periodLimit) private returns (uint256) {
        return vault.createPolicy(
            address(agent), address(token), maxPerTx, periodLimit, 1 days, uint64(block.timestamp + 30 days)
        );
    }
}
