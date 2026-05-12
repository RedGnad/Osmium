// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOsmiumERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IOsmiumPolicyEngine {
    function getPolicy(uint256 policyId)
        external
        view
        returns (
            address owner,
            address agent,
            address token,
            uint256 maxPerTx,
            uint256 periodLimit,
            uint64 periodSeconds,
            uint64 validUntil,
            bool active
        );

    function authorizePaymentForAgent(
        uint256 policyId,
        bytes32 intentHash,
        bytes32 contextHash,
        address agent,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool);
}

contract OsmiumSettlementRouter {
    IOsmiumPolicyEngine public immutable policyEngine;

    mapping(address owner => mapping(address token => uint256 balance)) public vaultBalance;

    event Deposited(address indexed owner, address indexed token, uint256 amount);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event PaymentSettled(
        uint256 indexed policyId,
        address indexed agent,
        address indexed merchant,
        address owner,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 intentHash,
        bytes32 receiptHash
    );
    event PaymentDenied(
        uint256 indexed policyId,
        address indexed agent,
        address indexed merchant,
        address owner,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 intentHash
    );

    error ZeroAddress();
    error InvalidAmount();
    error PolicyTokenMismatch();
    error InsufficientVaultBalance();
    error TransferFailed();

    constructor(IOsmiumPolicyEngine policyEngine_) {
        if (address(policyEngine_) == address(0)) revert ZeroAddress();
        policyEngine = policyEngine_;
    }

    function deposit(address token, uint256 amount) external {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        vaultBalance[msg.sender][token] += amount;
        if (!IOsmiumERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        uint256 balance = vaultBalance[msg.sender][token];
        if (balance < amount) revert InsufficientVaultBalance();

        vaultBalance[msg.sender][token] = balance - amount;
        if (!IOsmiumERC20(token).transfer(msg.sender, amount)) revert TransferFailed();

        emit Withdrawn(msg.sender, token, amount);
    }

    function settleWithIntent(
        uint256 policyId,
        bytes32 intentHash,
        bytes32 contextHash,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool settled) {
        (address owner,, address policyToken,,,,,) = policyEngine.getPolicy(policyId);
        if (token != policyToken) revert PolicyTokenMismatch();

        settled = policyEngine.authorizePaymentForAgent(
            policyId, intentHash, contextHash, msg.sender, merchant, token, amount, paymentId, receiptHash
        );

        if (!settled) {
            emit PaymentDenied(policyId, msg.sender, merchant, owner, token, amount, paymentId, intentHash);
            return false;
        }

        uint256 balance = vaultBalance[owner][token];
        if (balance < amount) revert InsufficientVaultBalance();

        vaultBalance[owner][token] = balance - amount;
        if (!IOsmiumERC20(token).transfer(merchant, amount)) revert TransferFailed();

        emit PaymentSettled(
            policyId, msg.sender, merchant, owner, token, amount, paymentId, intentHash, receiptHash
        );
        return true;
    }
}
