// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract OsmiumPolicyVault {
    enum BlockReason {
        None,
        PolicyInactive,
        UnauthorizedAgent,
        UnknownMerchant,
        TokenNotAllowed,
        OverMaxTx,
        OverBudget,
        Expired,
        Replay,
        MissingReceipt,
        InsufficientVaultBalance
    }

    struct Policy {
        address owner;
        address agent;
        address token;
        uint256 maxPerTx;
        uint256 periodLimit;
        uint64 periodSeconds;
        uint64 validUntil;
        bool active;
    }

    struct SpendState {
        uint64 periodStartedAt;
        uint256 spentInPeriod;
    }

    struct Merchant {
        bool active;
        bytes32 category;
        bytes32 metadataHash;
    }

    struct Receipt {
        uint256 policyId;
        address merchant;
        address token;
        uint256 amount;
        bytes32 receiptHash;
        uint64 paidAt;
    }

    address private immutable ADMIN;
    uint256 public nextPolicyId = 1;

    mapping(address => mapping(address => uint256)) public vaultBalance;
    mapping(address => Merchant) public merchants;
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => SpendState) public spendStates;
    mapping(bytes32 => bool) public usedPaymentIds;
    mapping(bytes32 => Receipt) public receipts;

    event Deposited(address indexed owner, address indexed token, uint256 amount);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event MerchantRegistered(address indexed merchant, bytes32 indexed category, bytes32 metadataHash);
    event MerchantStatusChanged(address indexed merchant, bool active);
    event PolicyCreated(
        uint256 indexed policyId,
        address indexed owner,
        address indexed agent,
        address token,
        uint256 maxPerTx,
        uint256 periodLimit,
        uint64 periodSeconds,
        uint64 validUntil
    );
    event PolicyStatusChanged(uint256 indexed policyId, bool active);
    event PaymentApproved(
        uint256 indexed policyId,
        address indexed agent,
        address indexed merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    );
    event PaymentBlocked(
        uint256 indexed policyId,
        address indexed agent,
        address indexed merchant,
        BlockReason reason,
        address token,
        uint256 amount,
        bytes32 paymentId
    );

    error NotAdmin();
    error NotPolicyOwner();
    error ZeroAddress();
    error InvalidPolicy();
    error TransferFailed();

    constructor() {
        ADMIN = msg.sender;
    }

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function admin() external view returns (address) {
        return ADMIN;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != ADMIN) revert NotAdmin();
    }

    function deposit(address token, uint256 amount) external {
        if (token == address(0)) revert ZeroAddress();
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        vaultBalance[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        uint256 balance = vaultBalance[msg.sender][token];
        require(balance >= amount, "VAULT_BALANCE");

        vaultBalance[msg.sender][token] = balance - amount;
        if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();

        emit Withdrawn(msg.sender, token, amount);
    }

    function registerMerchant(address merchant, bytes32 category, bytes32 metadataHash) external onlyAdmin {
        if (merchant == address(0)) revert ZeroAddress();

        merchants[merchant] = Merchant({active: true, category: category, metadataHash: metadataHash});
        emit MerchantRegistered(merchant, category, metadataHash);
    }

    function setMerchantStatus(address merchant, bool active) external onlyAdmin {
        merchants[merchant].active = active;
        emit MerchantStatusChanged(merchant, active);
    }

    function createPolicy(
        address agent,
        address token,
        uint256 maxPerTx,
        uint256 periodLimit,
        uint64 periodSeconds,
        uint64 validUntil
    ) external returns (uint256 policyId) {
        if (agent == address(0) || token == address(0)) revert ZeroAddress();
        if (maxPerTx == 0 || periodLimit == 0 || periodSeconds == 0) revert InvalidPolicy();
        if (periodLimit < maxPerTx) revert InvalidPolicy();
        if (validUntil <= block.timestamp) revert InvalidPolicy();

        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            owner: msg.sender,
            agent: agent,
            token: token,
            maxPerTx: maxPerTx,
            periodLimit: periodLimit,
            periodSeconds: periodSeconds,
            validUntil: validUntil,
            active: true
        });

        emit PolicyCreated(policyId, msg.sender, agent, token, maxPerTx, periodLimit, periodSeconds, validUntil);
    }

    function setPolicyStatus(uint256 policyId, bool active) external {
        Policy storage policy = policies[policyId];
        if (msg.sender != policy.owner) revert NotPolicyOwner();

        policy.active = active;
        emit PolicyStatusChanged(policyId, active);
    }

    function previewPayment(
        uint256 policyId,
        address agent,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external view returns (bool allowed, BlockReason reason) {
        reason = _validatePayment(policyId, agent, merchant, token, amount, paymentId, receiptHash);
        allowed = reason == BlockReason.None;
    }

    function executePayment(
        uint256 policyId,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) external returns (bool) {
        BlockReason reason = _validatePayment(policyId, msg.sender, merchant, token, amount, paymentId, receiptHash);
        if (reason != BlockReason.None) {
            emit PaymentBlocked(policyId, msg.sender, merchant, reason, token, amount, paymentId);
            return false;
        }

        Policy memory policy = policies[policyId];
        SpendState storage state = spendStates[policyId];
        (uint64 periodStartedAt, uint256 spentInPeriod) = _currentPeriod(policyId);

        state.periodStartedAt = periodStartedAt;
        state.spentInPeriod = spentInPeriod + amount;
        usedPaymentIds[paymentId] = true;
        vaultBalance[policy.owner][token] -= amount;
        receipts[paymentId] = Receipt({
            policyId: policyId,
            merchant: merchant,
            token: token,
            amount: amount,
            receiptHash: receiptHash,
            paidAt: uint64(block.timestamp)
        });

        if (!IERC20(token).transfer(merchant, amount)) revert TransferFailed();

        emit PaymentApproved(policyId, msg.sender, merchant, token, amount, paymentId, receiptHash);
        return true;
    }

    function currentPeriod(uint256 policyId) external view returns (uint64 periodStartedAt, uint256 spentInPeriod) {
        return _currentPeriod(policyId);
    }

    function _validatePayment(
        uint256 policyId,
        address agent,
        address merchant,
        address token,
        uint256 amount,
        bytes32 paymentId,
        bytes32 receiptHash
    ) internal view returns (BlockReason) {
        Policy memory policy = policies[policyId];

        if (!policy.active) return BlockReason.PolicyInactive;
        if (agent != policy.agent) return BlockReason.UnauthorizedAgent;
        if (!merchants[merchant].active) return BlockReason.UnknownMerchant;
        if (token != policy.token) return BlockReason.TokenNotAllowed;
        if (amount == 0 || amount > policy.maxPerTx) return BlockReason.OverMaxTx;
        if (block.timestamp > policy.validUntil) return BlockReason.Expired;
        if (paymentId == bytes32(0) || usedPaymentIds[paymentId]) return BlockReason.Replay;
        if (receiptHash == bytes32(0)) return BlockReason.MissingReceipt;
        if (vaultBalance[policy.owner][token] < amount) return BlockReason.InsufficientVaultBalance;

        (, uint256 spentInPeriod) = _currentPeriod(policyId);
        if (spentInPeriod + amount > policy.periodLimit) return BlockReason.OverBudget;

        return BlockReason.None;
    }

    function _currentPeriod(uint256 policyId) internal view returns (uint64 periodStartedAt, uint256 spentInPeriod) {
        Policy memory policy = policies[policyId];
        SpendState memory state = spendStates[policyId];

        if (state.periodStartedAt == 0) {
            return (uint64(block.timestamp), 0);
        }

        if (block.timestamp >= uint256(state.periodStartedAt) + uint256(policy.periodSeconds)) {
            return (uint64(block.timestamp), 0);
        }

        return (state.periodStartedAt, state.spentInPeriod);
    }
}
