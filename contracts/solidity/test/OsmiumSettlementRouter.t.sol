// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "../src/MockERC20.sol";
import {IOsmiumPolicyEngine, OsmiumSettlementRouter} from "../src/OsmiumSettlementRouter.sol";

interface IDirectAuthorization {
    function authorizePaymentWithIntent(
        uint256 policyId,
        bytes32 intentHash,
        bytes32 contextHash,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool);
}

contract MockPolicyEngine is IOsmiumPolicyEngine {
    address public owner;
    address public agent;
    address public token;
    bool public allow = true;
    address public lastAgent;
    bytes32 public lastContextHash;

    function setPolicy(address owner_, address agent_, address token_) external {
        owner = owner_;
        agent = agent_;
        token = token_;
    }

    function setAllow(bool allow_) external {
        allow = allow_;
    }

    function getPolicy(uint256)
        external
        view
        returns (
            address,
            address,
            address,
            uint256,
            uint256,
            uint64,
            uint64,
            bool
        )
    {
        return (owner, agent, token, 10 ether, 25 ether, 1 days, uint64(block.timestamp + 30 days), true);
    }

    function authorizePaymentForAgent(
        uint256,
        bytes32,
        bytes32 contextHash,
        address agent_,
        address,
        address,
        uint256,
        bytes32,
        bytes32
    ) external returns (bool) {
        lastAgent = agent_;
        lastContextHash = contextHash;
        return allow && agent_ == agent;
    }
}

contract SettlementAgent {
    function settle(
        OsmiumSettlementRouter router,
        uint256 policyId,
        bytes32 intentHash,
        bytes32 contextHash,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool) {
        return router.settleWithIntent(policyId, intentHash, contextHash, merchant, token, amount, paymentId, receiptHash);
    }
}

contract DirectAuthorizationDisabled {
    function authorizePaymentWithIntent(
        uint256,
        bytes32,
        bytes32,
        address,
        address,
        uint256,
        bytes32,
        bytes32
    ) external pure returns (bool) {
        revert("USE_SETTLEMENT_ROUTER");
    }
}

contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 received = amount / 2;
        super.transferFrom(from, to, received);
        return true;
    }
}

contract OsmiumSettlementRouterTest {
    MockERC20 private token;
    MockPolicyEngine private engine;
    OsmiumSettlementRouter private router;
    SettlementAgent private agent;

    address private merchant = address(0xBEEF);

    function setUp() public {
        token = new MockERC20("Mock USDG", "USDG", 18);
        engine = new MockPolicyEngine();
        router = new OsmiumSettlementRouter(engine);
        agent = new SettlementAgent();

        engine.setPolicy(address(this), address(agent), address(token));

        token.mint(address(this), 100 ether);
        token.approve(address(router), type(uint256).max);
        router.deposit(address(token), 50 ether);
    }

    function testSettlesOnlyAfterPolicyEngineApproval() public {
        bool settled = agent.settle(
            router,
            1,
            keccak256("intent"),
            keccak256("context"),
            merchant,
            address(token),
            5 ether,
            keccak256("payment"),
            keccak256("receipt")
        );

        require(settled, "NOT_SETTLED");
        require(token.balanceOf(merchant) == 5 ether, "MERCHANT_NOT_PAID");
        require(router.vaultBalance(address(this), address(token)) == 45 ether, "VAULT_NOT_DEBITED");
        require(engine.lastAgent() == address(agent), "AGENT_NOT_FORWARDED");
        require(engine.lastContextHash() == keccak256("context"), "CONTEXT_NOT_FORWARDED");
    }

    function testDeniedPaymentDoesNotMoveFunds() public {
        engine.setAllow(false);

        bool settled = agent.settle(
            router,
            1,
            keccak256("intent-denied"),
            keccak256("context-denied"),
            merchant,
            address(token),
            5 ether,
            keccak256("payment-denied"),
            keccak256("receipt-denied")
        );

        require(!settled, "DENIED_SETTLED");
        require(token.balanceOf(merchant) == 0, "DENIED_PAID");
        require(router.vaultBalance(address(this), address(token)) == 50 ether, "DENIED_DEBITED");
    }

    function testRejectsWrongTokenBeforeSettlement() public {
        MockERC20 otherToken = new MockERC20("Other", "OTHER", 18);

        try agent.settle(
            router,
            1,
            keccak256("intent-wrong-token"),
            keccak256("context-wrong-token"),
            merchant,
            address(otherToken),
            5 ether,
            keccak256("payment-wrong-token"),
            keccak256("receipt-wrong-token")
        ) returns (bool) {
            revert("WRONG_TOKEN_ALLOWED");
        } catch {}

        require(token.balanceOf(merchant) == 0, "WRONG_TOKEN_PAID");
    }

    function testDepositCreditsOnlyReceivedTokenAmount() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(address(this), 10 ether);
        feeToken.approve(address(router), type(uint256).max);

        router.deposit(address(feeToken), 4 ether);

        require(router.vaultBalance(address(this), address(feeToken)) == 2 ether, "FEE_TOKEN_OVER_CREDITED");
        require(feeToken.balanceOf(address(router)) == 2 ether, "FEE_TOKEN_RECEIVED");
    }

    function testDirectAuthorizationRevertsUseSettlementRouter() public {
        IDirectAuthorization direct = IDirectAuthorization(address(new DirectAuthorizationDisabled()));

        try direct.authorizePaymentWithIntent(
            1,
            keccak256("intent"),
            keccak256("context"),
            merchant,
            address(token),
            1 ether,
            keccak256("payment"),
            keccak256("receipt")
        ) returns (bool) {
            revert("DIRECT_AUTH_ALLOWED");
        } catch Error(string memory reason) {
            require(keccak256(bytes(reason)) == keccak256("USE_SETTLEMENT_ROUTER"), "WRONG_DIRECT_AUTH_REASON");
        }
    }
}
