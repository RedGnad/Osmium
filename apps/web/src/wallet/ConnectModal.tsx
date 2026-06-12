import { useEffect, useState } from "react";
import {
  Wallet as WalletIcon,
  X,
  ScanLine,
  ExternalLink,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "./WalletProvider";
import {
  discoveredWallets,
  onWalletDiscovery,
  requestWalletDiscovery,
  type DiscoveredWallet,
} from "./walletAdapter";
import { RH_CHAIN_ID, robinhoodTestnet } from "./contracts";

type DetectedInjected =
  | { kind: "none" }
  | { kind: "metamask" }
  | { kind: "rabby" }
  | { kind: "coinbase" }
  | { kind: "generic" };

function detectInjected(): DetectedInjected {
  if (typeof window === "undefined") return { kind: "none" };
  const w = window as unknown as {
    ethereum?: {
      isMetaMask?: boolean;
      isRabby?: boolean;
      isCoinbaseWallet?: boolean;
    };
  };
  const eth = w.ethereum;
  if (!eth) return { kind: "none" };
  if (eth.isRabby) return { kind: "rabby" };
  if (eth.isCoinbaseWallet) return { kind: "coinbase" };
  if (eth.isMetaMask) return { kind: "metamask" };
  return { kind: "generic" };
}

const labels: Record<DetectedInjected["kind"], string> = {
  metamask: "MetaMask",
  rabby: "Rabby",
  coinbase: "Coinbase Wallet",
  generic: "Browser wallet",
  none: "No injected wallet detected",
};

export function ConnectModal() {
  const { modal, adapter, state, walletConnectAvailable } = useWallet();
  const [injected, setInjected] = useState<DetectedInjected>({ kind: "none" });
  const [wallets, setWallets] = useState<DiscoveredWallet[]>(() =>
    discoveredWallets(),
  );

  useEffect(() => {
    setInjected(detectInjected());
    if (!modal.open) return;
    /* EIP-6963: list every installed extension wallet, not just the one
       that won the window.ethereum injection race. */
    setWallets(discoveredWallets());
    const off = onWalletDiscovery(() => setWallets(discoveredWallets()));
    requestWalletDiscovery();
    return () => {
      off();
    };
  }, [modal.open]);

  /* close on ESC */
  useEffect(() => {
    if (!modal.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") modal.closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  if (!modal.open) return null;

  const connectingInjected =
    state.status === "connecting" && state.connector === "injected";
  const connectingWC =
    state.status === "connecting" && state.connector === "walletconnect";
  const errorInjected =
    state.status === "error" && state.connector === "injected"
      ? state.error
      : null;
  const errorWC =
    state.status === "error" && state.connector === "walletconnect"
      ? state.error
      : null;

  const connected = state.status === "connected" ? state : null;
  const explorer = robinhoodTestnet.blockExplorers.default.url;

  return (
    <div
      className="walletBackdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) modal.closeModal();
      }}
    >
      <div
        className="walletDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
      >
        <div className="walletHead">
          <div>
            <span className="walletEyebrow">Operator session</span>
            <h2 id="connect-title">
              Connect a <em>wallet.</em>
            </h2>
          </div>
          <button
            className="walletClose"
            onClick={modal.closeModal}
            aria-label="Close"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {connected ? (
          <>
            <p className="walletLede">
              Self-serve mode signs settlements directly from your wallet. No
              custodial relationship; Osmium never touches your spend key.
            </p>

            <div className="walletAccountBlock">
              <div className="walletAccountRow">
                <span className="walletAccountLabel">Account</span>
                <span className="walletAccountValue">
                  {connected.account.slice(0, 6)}…{connected.account.slice(-4)}
                </span>
              </div>
              <div className="walletAccountRow">
                <span className="walletAccountLabel">Network</span>
                <span
                  className={`walletAccountValue ${connected.onWrongChain ? "wrong" : ""}`}
                >
                  {connected.onWrongChain
                    ? `Wrong network (chain ${connected.chainId})`
                    : "Robinhood Chain Testnet"}
                </span>
              </div>
              <div className="walletAccountRow">
                <span className="walletAccountLabel">Connector</span>
                <span className="walletAccountValue">
                  {connected.walletName ?? connected.connector}
                </span>
              </div>
            </div>

            {connected.onWrongChain ? (
              <div className="walletError">
                Wrong network. Osmium runs on eip155:{RH_CHAIN_ID}.
                <button
                  type="button"
                  className="walletInlineBtn"
                  onClick={() => void adapter.switchToOsmiumChain()}
                >
                  <RefreshCw size={11} /> Switch to Robinhood Chain
                </button>
              </div>
            ) : null}

            <div className="walletAccountActions">
              <a
                className="walletInlineLink"
                href={`${explorer}/address/${connected.account}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={12} /> View on explorer
              </a>
              <button
                type="button"
                className="walletInlineBtn danger"
                onClick={() => void adapter.disconnect()}
              >
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="walletLede">
              Self-serve mode signs settlements directly from your wallet. No
              custodial relationship; Osmium never touches your spend key.
            </p>

            <div className="walletOptions">
              {wallets.length > 0 ? (
                wallets.map((w) => {
                  const connectingThis =
                    connectingInjected &&
                    state.status === "connecting" &&
                    state.rdns === w.info.rdns;
                  return (
                    <button
                      key={w.info.rdns}
                      type="button"
                      className="walletOption"
                      disabled={connectingInjected}
                      onClick={() =>
                        void adapter.connect("injected", w.info.rdns)
                      }
                    >
                      <img
                        className="walletOptionIcon"
                        src={w.info.icon}
                        alt=""
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{w.info.name}</strong>
                        <span>Sign with the {w.info.name} extension</span>
                      </div>
                      <span className="walletOptionTag">
                        {connectingThis ? "Connecting…" : "EIP-6963"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <button
                  type="button"
                  className="walletOption"
                  disabled={injected.kind === "none" || connectingInjected}
                  onClick={() => void adapter.connect("injected")}
                >
                  <WalletIcon size={18} />
                  <div>
                    <strong>{labels[injected.kind]}</strong>
                    <span>
                      {injected.kind === "none"
                        ? "Install MetaMask, Rabby or Coinbase Wallet"
                        : "Sign with the browser-injected provider"}
                    </span>
                  </div>
                  <span className="walletOptionTag">
                    {connectingInjected ? "Connecting…" : "EIP-1193"}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="walletOption"
                disabled={!walletConnectAvailable || connectingWC}
                onClick={() => void adapter.connect("walletconnect")}
                title={
                  walletConnectAvailable
                    ? undefined
                    : "Set VITE_WALLETCONNECT_PROJECT_ID in apps/web/.env to enable"
                }
              >
                <ScanLine size={18} />
                <div>
                  <strong>WalletConnect</strong>
                  <span>
                    {walletConnectAvailable
                      ? "Scan a QR with your mobile wallet"
                      : "Not configured · coming soon"}
                  </span>
                </div>
                <span className="walletOptionTag">
                  {connectingWC ? "Connecting…" : "v2"}
                </span>
              </button>
            </div>

            {errorInjected || errorWC ? (
              <div className="walletError">{errorInjected ?? errorWC}</div>
            ) : null}
          </>
        )}

        <div className="walletFoot">
          <span>
            Robinhood Chain Testnet · <strong>eip155:46630</strong>
          </span>
          <span>
            Need test gas?{" "}
            <a
              href="https://faucet.testnet.chain.robinhood.com/"
              target="_blank"
              rel="noreferrer"
            >
              faucet
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
