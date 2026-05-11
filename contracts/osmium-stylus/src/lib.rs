#![cfg_attr(not(any(feature = "export-abi", test)), no_main)]

extern crate alloc;

use alloc::vec::Vec;

use alloy_sol_types::sol;
use stylus_sdk::{
    alloy_primitives::{Address, B256, U256, U64},
    prelude::*,
};

const REASON_NONE: u8 = 0;
const REASON_POLICY_INACTIVE: u8 = 1;
const REASON_UNAUTHORIZED_AGENT: u8 = 2;
const REASON_UNKNOWN_MERCHANT: u8 = 3;
const REASON_TOKEN_NOT_ALLOWED: u8 = 4;
const REASON_OVER_MAX_TX: u8 = 5;
const REASON_OVER_BUDGET: u8 = 6;
const REASON_EXPIRED: u8 = 7;
const REASON_REPLAY: u8 = 8;
const REASON_MISSING_RECEIPT: u8 = 9;
const REASON_INVALID_INTENT: u8 = 10;
const REASON_INTENT_EXPIRED: u8 = 11;
const REASON_INTENT_AMOUNT_EXCEEDED: u8 = 12;

sol_storage! {
    #[entrypoint]
    pub struct OsmiumPolicyEngine {
        address admin;
        uint256 next_policy_id;
        mapping(address => Merchant) merchants;
        mapping(uint256 => Policy) policies;
        mapping(uint256 => SpendState) spend_states;
        mapping(bytes32 => Intent) intents;
        mapping(bytes32 => bool) used_payment_ids;
        mapping(bytes32 => Receipt) receipts;
    }

    pub struct Merchant {
        bool active;
        bytes32 category;
        bytes32 metadata_hash;
    }

    pub struct Policy {
        address owner;
        address agent;
        address token;
        uint256 max_per_tx;
        uint256 period_limit;
        uint64 period_seconds;
        uint64 valid_until;
        bool active;
    }

    pub struct SpendState {
        uint64 period_started_at;
        uint256 spent_in_period;
    }

    pub struct Receipt {
        uint256 policy_id;
        bytes32 intent_hash;
        address merchant;
        address token;
        uint256 amount;
        bytes32 receipt_hash;
        uint64 authorized_at;
    }

    pub struct Intent {
        uint256 policy_id;
        bytes32 context_hash;
        uint256 max_amount;
        uint64 valid_until;
        bool active;
    }
}

sol! {
    event AdminInitialized(address indexed admin);
    event MerchantRegistered(address indexed merchant, bytes32 indexed category, bytes32 metadata_hash);
    event MerchantStatusChanged(address indexed merchant, bool active);
    event PolicyCreated(
        uint256 indexed policy_id,
        address indexed owner,
        address indexed agent,
        address token,
        uint256 max_per_tx,
        uint256 period_limit,
        uint64 period_seconds,
        uint64 valid_until
    );
    event PolicyStatusChanged(uint256 indexed policy_id, bool active);
    event IntentApproved(
        uint256 indexed policy_id,
        bytes32 indexed intent_hash,
        bytes32 context_hash,
        uint256 max_amount,
        uint64 valid_until
    );
    event IntentRevoked(uint256 indexed policy_id, bytes32 indexed intent_hash);
    event AuthorizationApproved(
        uint256 indexed policy_id,
        address indexed agent,
        address indexed merchant,
        address token,
        uint256 amount,
        bytes32 payment_id,
        bytes32 receipt_hash,
        bytes32 intent_hash
    );
    event AuthorizationBlocked(
        uint256 indexed policy_id,
        address indexed agent,
        address indexed merchant,
        uint8 reason,
        address token,
        uint256 amount,
        bytes32 payment_id
    );
}

#[public]
impl OsmiumPolicyEngine {
    pub fn init(&mut self) -> Result<(), Vec<u8>> {
        if self.admin.get() != Address::ZERO {
            return Err(b"ALREADY_INITIALIZED".to_vec());
        }

        let sender = self.vm().msg_sender();
        self.admin.set(sender);
        self.next_policy_id.set(U256::from(1));
        self.vm().log(AdminInitialized { admin: sender });
        Ok(())
    }

    pub fn admin(&self) -> Address {
        self.admin.get()
    }

    pub fn next_policy_id(&self) -> U256 {
        self.next_policy_id_or_one()
    }

    pub fn register_merchant(
        &mut self,
        merchant_address: Address,
        category: B256,
        metadata_hash: B256,
    ) -> Result<(), Vec<u8>> {
        self.ensure_admin()?;
        if merchant_address == Address::ZERO {
            return Err(b"ZERO_MERCHANT".to_vec());
        }

        let mut merchant = self.merchants.setter(merchant_address);
        merchant.active.set(true);
        merchant.category.set(category);
        merchant.metadata_hash.set(metadata_hash);

        self.vm().log(MerchantRegistered {
            merchant: merchant_address,
            category,
            metadata_hash,
        });
        Ok(())
    }

    pub fn set_merchant_status(
        &mut self,
        merchant_address: Address,
        active: bool,
    ) -> Result<(), Vec<u8>> {
        self.ensure_admin()?;
        self.merchants.setter(merchant_address).active.set(active);
        self.vm().log(MerchantStatusChanged {
            merchant: merchant_address,
            active,
        });
        Ok(())
    }

    pub fn get_merchant(&self, merchant_address: Address) -> (bool, B256, B256) {
        let merchant = self.merchants.getter(merchant_address);
        (
            merchant.active.get(),
            merchant.category.get(),
            merchant.metadata_hash.get(),
        )
    }

    pub fn create_policy(
        &mut self,
        agent: Address,
        token: Address,
        max_per_tx: U256,
        period_limit: U256,
        period_seconds: u64,
        valid_until: u64,
    ) -> Result<U256, Vec<u8>> {
        let owner = self.vm().msg_sender();
        let now = self.vm().block_timestamp();

        if agent == Address::ZERO || token == Address::ZERO {
            return Err(b"ZERO_ADDRESS".to_vec());
        }
        if max_per_tx == U256::ZERO || period_limit == U256::ZERO || period_seconds == 0 {
            return Err(b"INVALID_POLICY".to_vec());
        }
        if period_limit < max_per_tx || valid_until <= now {
            return Err(b"INVALID_LIMITS".to_vec());
        }

        let policy_id = self.next_policy_id_or_one();
        self.next_policy_id.set(policy_id + U256::from(1));

        let mut policy = self.policies.setter(policy_id);
        policy.owner.set(owner);
        policy.agent.set(agent);
        policy.token.set(token);
        policy.max_per_tx.set(max_per_tx);
        policy.period_limit.set(period_limit);
        policy.period_seconds.set(U64::from(period_seconds));
        policy.valid_until.set(U64::from(valid_until));
        policy.active.set(true);

        self.vm().log(PolicyCreated {
            policy_id,
            owner,
            agent,
            token,
            max_per_tx,
            period_limit,
            period_seconds,
            valid_until,
        });
        Ok(policy_id)
    }

    pub fn set_policy_status(&mut self, policy_id: U256, active: bool) -> Result<(), Vec<u8>> {
        let owner = self.policies.getter(policy_id).owner.get();
        if owner != self.vm().msg_sender() {
            return Err(b"NOT_POLICY_OWNER".to_vec());
        }

        self.policies.setter(policy_id).active.set(active);
        self.vm().log(PolicyStatusChanged { policy_id, active });
        Ok(())
    }

    pub fn approve_intent(
        &mut self,
        policy_id: U256,
        intent_hash: B256,
        context_hash: B256,
        max_amount: U256,
        valid_until: u64,
    ) -> Result<(), Vec<u8>> {
        let policy = self.policies.getter(policy_id);
        if policy.owner.get() != self.vm().msg_sender() {
            return Err(b"NOT_POLICY_OWNER".to_vec());
        }
        if intent_hash == B256::ZERO || context_hash == B256::ZERO || max_amount == U256::ZERO {
            return Err(b"INVALID_INTENT".to_vec());
        }
        if valid_until > policy.valid_until.get().to::<u64>() {
            return Err(b"INTENT_AFTER_POLICY".to_vec());
        }

        let mut intent = self.intents.setter(intent_hash);
        intent.policy_id.set(policy_id);
        intent.context_hash.set(context_hash);
        intent.max_amount.set(max_amount);
        intent.valid_until.set(U64::from(valid_until));
        intent.active.set(true);

        self.vm().log(IntentApproved {
            policy_id,
            intent_hash,
            context_hash,
            max_amount,
            valid_until,
        });
        Ok(())
    }

    pub fn revoke_intent(&mut self, policy_id: U256, intent_hash: B256) -> Result<(), Vec<u8>> {
        let policy = self.policies.getter(policy_id);
        if policy.owner.get() != self.vm().msg_sender() {
            return Err(b"NOT_POLICY_OWNER".to_vec());
        }

        self.intents.setter(intent_hash).active.set(false);
        self.vm().log(IntentRevoked {
            policy_id,
            intent_hash,
        });
        Ok(())
    }

    pub fn get_intent(&self, intent_hash: B256) -> (U256, B256, U256, u64, bool) {
        let intent = self.intents.getter(intent_hash);
        (
            intent.policy_id.get(),
            intent.context_hash.get(),
            intent.max_amount.get(),
            intent.valid_until.get().to::<u64>(),
            intent.active.get(),
        )
    }

    pub fn get_policy(
        &self,
        policy_id: U256,
    ) -> (Address, Address, Address, U256, U256, u64, u64, bool) {
        let policy = self.policies.getter(policy_id);
        (
            policy.owner.get(),
            policy.agent.get(),
            policy.token.get(),
            policy.max_per_tx.get(),
            policy.period_limit.get(),
            policy.period_seconds.get().to::<u64>(),
            policy.valid_until.get().to::<u64>(),
            policy.active.get(),
        )
    }

    pub fn current_period(&self, policy_id: U256) -> (u64, U256) {
        self.current_period_inner(policy_id)
    }

    pub fn preview_authorization(
        &self,
        policy_id: U256,
        agent: Address,
        merchant: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> (bool, u8) {
        let reason = self.validate_authorization(
            policy_id,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );
        (reason == REASON_NONE, reason)
    }

    pub fn preview_authorization_with_intent(
        &self,
        policy_id: U256,
        intent_hash: B256,
        agent: Address,
        merchant: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> (bool, u8) {
        let reason = self.validate_authorization_with_intent(
            policy_id,
            intent_hash,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );
        (reason == REASON_NONE, reason)
    }

    pub fn authorize_payment(
        &mut self,
        policy_id: U256,
        merchant: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> Result<bool, Vec<u8>> {
        let agent = self.vm().msg_sender();
        let reason = self.validate_authorization(
            policy_id,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );

        if reason != REASON_NONE {
            self.vm().log(AuthorizationBlocked {
                policy_id,
                agent,
                merchant,
                reason,
                token,
                amount,
                payment_id,
            });
            return Ok(false);
        }

        self.record_authorization(
            policy_id,
            B256::ZERO,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );
        Ok(true)
    }

    pub fn authorize_payment_with_intent(
        &mut self,
        policy_id: U256,
        intent_hash: B256,
        merchant: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> Result<bool, Vec<u8>> {
        let agent = self.vm().msg_sender();
        let reason = self.validate_authorization_with_intent(
            policy_id,
            intent_hash,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );

        if reason != REASON_NONE {
            self.vm().log(AuthorizationBlocked {
                policy_id,
                agent,
                merchant,
                reason,
                token,
                amount,
                payment_id,
            });
            return Ok(false);
        }

        self.record_authorization(
            policy_id,
            intent_hash,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
        );
        Ok(true)
    }

    pub fn get_receipt(&self, payment_id: B256) -> (U256, B256, Address, Address, U256, B256, u64) {
        let receipt = self.receipts.getter(payment_id);
        (
            receipt.policy_id.get(),
            receipt.intent_hash.get(),
            receipt.merchant.get(),
            receipt.token.get(),
            receipt.amount.get(),
            receipt.receipt_hash.get(),
            receipt.authorized_at.get().to::<u64>(),
        )
    }
}

impl OsmiumPolicyEngine {
    fn ensure_admin(&mut self) -> Result<(), Vec<u8>> {
        if self.admin.get() == Address::ZERO {
            let sender = self.vm().msg_sender();
            self.admin.set(sender);
            if self.next_policy_id.get() == U256::ZERO {
                self.next_policy_id.set(U256::from(1));
            }
            self.vm().log(AdminInitialized { admin: sender });
        }

        if self.admin.get() != self.vm().msg_sender() {
            return Err(b"NOT_ADMIN".to_vec());
        }
        Ok(())
    }

    fn next_policy_id_or_one(&self) -> U256 {
        let next = self.next_policy_id.get();
        if next == U256::ZERO {
            U256::from(1)
        } else {
            next
        }
    }

    fn validate_authorization(
        &self,
        policy_id: U256,
        agent: Address,
        merchant_address: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> u8 {
        let policy = self.policies.getter(policy_id);

        if !policy.active.get() {
            return REASON_POLICY_INACTIVE;
        }
        if agent != policy.agent.get() {
            return REASON_UNAUTHORIZED_AGENT;
        }
        if !self.merchants.getter(merchant_address).active.get() {
            return REASON_UNKNOWN_MERCHANT;
        }
        if token != policy.token.get() {
            return REASON_TOKEN_NOT_ALLOWED;
        }
        if amount == U256::ZERO || amount > policy.max_per_tx.get() {
            return REASON_OVER_MAX_TX;
        }
        if self.vm().block_timestamp() > policy.valid_until.get().to::<u64>() {
            return REASON_EXPIRED;
        }
        if payment_id == B256::ZERO || self.used_payment_ids.get(payment_id) {
            return REASON_REPLAY;
        }
        if receipt_hash == B256::ZERO {
            return REASON_MISSING_RECEIPT;
        }

        let (_, spent_in_period) = self.current_period_inner(policy_id);
        if spent_in_period + amount > policy.period_limit.get() {
            return REASON_OVER_BUDGET;
        }

        REASON_NONE
    }

    fn validate_authorization_with_intent(
        &self,
        policy_id: U256,
        intent_hash: B256,
        agent: Address,
        merchant_address: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) -> u8 {
        let base_reason = self.validate_authorization(
            policy_id,
            agent,
            merchant_address,
            token,
            amount,
            payment_id,
            receipt_hash,
        );
        if base_reason != REASON_NONE {
            return base_reason;
        }

        let intent = self.intents.getter(intent_hash);
        if intent_hash == B256::ZERO || !intent.active.get() || intent.policy_id.get() != policy_id
        {
            return REASON_INVALID_INTENT;
        }
        if self.vm().block_timestamp() > intent.valid_until.get().to::<u64>() {
            return REASON_INTENT_EXPIRED;
        }
        if amount > intent.max_amount.get() {
            return REASON_INTENT_AMOUNT_EXCEEDED;
        }

        REASON_NONE
    }

    fn record_authorization(
        &mut self,
        policy_id: U256,
        intent_hash: B256,
        agent: Address,
        merchant: Address,
        token: Address,
        amount: U256,
        payment_id: B256,
        receipt_hash: B256,
    ) {
        let (period_started_at, spent_in_period) = self.current_period_inner(policy_id);
        let mut state = self.spend_states.setter(policy_id);
        state.period_started_at.set(U64::from(period_started_at));
        state.spent_in_period.set(spent_in_period + amount);

        self.used_payment_ids.setter(payment_id).set(true);

        let authorized_at = self.vm().block_timestamp();
        let mut receipt = self.receipts.setter(payment_id);
        receipt.policy_id.set(policy_id);
        receipt.intent_hash.set(intent_hash);
        receipt.merchant.set(merchant);
        receipt.token.set(token);
        receipt.amount.set(amount);
        receipt.receipt_hash.set(receipt_hash);
        receipt.authorized_at.set(U64::from(authorized_at));

        self.vm().log(AuthorizationApproved {
            policy_id,
            agent,
            merchant,
            token,
            amount,
            payment_id,
            receipt_hash,
            intent_hash,
        });
    }

    fn current_period_inner(&self, policy_id: U256) -> (u64, U256) {
        let now = self.vm().block_timestamp();
        let state = self.spend_states.getter(policy_id);
        let started_at = state.period_started_at.get().to::<u64>();

        if started_at == 0 {
            return (now, U256::ZERO);
        }

        let policy = self.policies.getter(policy_id);
        if now >= started_at.saturating_add(policy.period_seconds.get().to::<u64>()) {
            return (now, U256::ZERO);
        }

        (started_at, state.spent_in_period.get())
    }
}
