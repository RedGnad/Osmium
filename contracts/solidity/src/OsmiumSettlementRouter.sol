// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOsmiumERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

library SafeTransfer {
    error SafeTransferFailed();

    function safeTransfer(IOsmiumERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(address(token), abi.encodeCall(IOsmiumERC20.transfer, (to, value)));
    }

    function safeTransferFrom(IOsmiumERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(address(token), abi.encodeCall(IOsmiumERC20.transferFrom, (from, to, value)));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        (bool success, bytes memory returndata) = token.call(data);
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) {
            revert SafeTransferFailed();
        }
    }
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
    using SafeTransfer for IOsmiumERC20;

    IOsmiumPolicyEngine public immutable policyEngine;
    uint256 private locked = 1;

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
    error Reentrancy();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IOsmiumPolicyEngine policyEngine_) {
        if (address(policyEngine_) == address(0)) revert ZeroAddress();
        policyEngine = policyEngine_;
    }

    function deposit(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        IOsmiumERC20 asset = IOsmiumERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = asset.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert InvalidAmount();

        vaultBalance[msg.sender][token] += received;
        emit Deposited(msg.sender, token, received);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 balance = vaultBalance[msg.sender][token];
        if (balance < amount) revert InsufficientVaultBalance();

        vaultBalance[msg.sender][token] = balance - amount;
        IOsmiumERC20(token).safeTransfer(msg.sender, amount);

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
    ) external nonReentrant returns (bool settled) {
        (address owner,, address policyToken,,,,,) = policyEngine.getPolicy(policyId);
        if (token != policyToken) revert PolicyTokenMismatch();

        uint256 balance = vaultBalance[owner][token];
        if (balance < amount) revert InsufficientVaultBalance();

        settled = policyEngine.authorizePaymentForAgent(
            policyId, intentHash, contextHash, msg.sender, merchant, token, amount, paymentId, receiptHash
        );

        if (!settled) {
            emit PaymentDenied(policyId, msg.sender, merchant, owner, token, amount, paymentId, intentHash);
            return false;
        }

        vaultBalance[owner][token] = balance - amount;
        IOsmiumERC20(token).safeTransfer(merchant, amount);

        emit PaymentSettled(
            policyId, msg.sender, merchant, owner, token, amount, paymentId, intentHash, receiptHash
        );
        return true;
    }
}
