/*
 * Wallet adapter for Osmium self-serve.
 *
 *   - EIP-1193 injected wallets (MetaMask, Rabby, Frame, Coinbase Wallet)
 *   - WalletConnect v2 (optional — requires VITE_WALLETCONNECT_PROJECT_ID)
 *
 * The adapter is provider-agnostic: it returns an EIP-1193 transport that
 * viem's createWalletClient consumes. No wagmi, no AppKit — small surface,
 * full control of the connect UX.
 *
 * Persists last-used connector + account in localStorage so a reload keeps
 * the wallet connected.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type EIP1193Provider,
} from "viem";
import { RH_CHAIN_ID, RH_RPC_URL, robinhoodTestnet } from "./contracts";

export type ConnectorKind = "injected" | "walletconnect";

export type WalletState =
  | { status: "idle" }
  | { status: "connecting"; connector: ConnectorKind }
  | { status: "error"; connector: ConnectorKind; error: string }
  | {
      status: "connected";
      connector: ConnectorKind;
      account: Address;
      chainId: number;
      onWrongChain: boolean;
      provider: EIP1193Provider;
    };

export type WalletAdapter = {
  state: WalletState;
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  nativeBalance: string;
  connect: (kind: ConnectorKind) => Promise<void>;
  disconnect: () => Promise<void>;
  switchToOsmiumChain: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  onChange: (cb: (state: WalletState) => void) => () => void;
};

const STORAGE_KEY = "osmium.wallet";
const WC_PROJECT_ID =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";

export const walletConnectAvailable = Boolean(WC_PROJECT_ID);

type Persisted = {
  connector: ConnectorKind;
  account: Address;
};

function readPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed.account || !parsed.connector) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(value: Persisted | null) {
  try {
    if (!value) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* localStorage disabled — silently ignore */
  }
}

function getInjected(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: EIP1193Provider };
  return w.ethereum ?? null;
}

let wcProvider: EIP1193Provider | null = null;

async function getOrCreateWalletConnect(): Promise<EIP1193Provider> {
  if (wcProvider) return wcProvider;
  if (!WC_PROJECT_ID) {
    throw new Error(
      "WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID in apps/web/.env to enable.",
    );
  }
  const { EthereumProvider } = await import(
    "@walletconnect/ethereum-provider"
  );
  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [RH_CHAIN_ID],
    showQrModal: true,
    metadata: {
      name: "Osmium Clearing House",
      description:
        "Policy-aware x402-compatible clearing layer for AI finance agents.",
      url: window.location.origin,
      icons: [],
    },
    qrModalOptions: {
      themeMode: "dark",
      themeVariables: {
        "--wcm-z-index": "1000",
        "--wcm-accent-color": "#D8D1C0",
        "--wcm-background-color": "#0D1117",
      },
    },
  });
  wcProvider = provider as unknown as EIP1193Provider;
  return wcProvider;
}

/* ────────────────────────────────────────────────────────────────────────
   Adapter factory
   ──────────────────────────────────────────────────────────────────────── */

export function createWalletAdapter(): WalletAdapter {
  const publicClient = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(RH_RPC_URL),
  });

  let state: WalletState = { status: "idle" };
  let walletClient: WalletClient | null = null;
  let nativeBalance = "—";
  const listeners = new Set<(s: WalletState) => void>();

  function setState(next: WalletState) {
    state = next;
    listeners.forEach((cb) => cb(next));
  }

  function makeWalletClient(provider: EIP1193Provider): WalletClient {
    return createWalletClient({
      chain: robinhoodTestnet,
      transport: custom(provider),
    });
  }

  async function refreshBalance() {
    if (state.status !== "connected") return;
    try {
      const balance = await publicClient.getBalance({ address: state.account });
      nativeBalance = `${Number(formatEther(balance)).toFixed(4)} ETH`;
      // re-emit to trigger UI re-renders that read balance
      listeners.forEach((cb) => cb(state));
    } catch {
      nativeBalance = "—";
    }
  }

  function attachProviderListeners(provider: EIP1193Provider) {
    const onAccountsChanged = (accounts: readonly string[]) => {
      if (state.status !== "connected") return;
      const next = accounts[0] as Address | undefined;
      if (!next) {
        void doDisconnect();
        return;
      }
      const updated: WalletState = { ...state, account: next };
      writePersisted({ connector: state.connector, account: next });
      setState(updated);
      void refreshBalance();
    };
    const onChainChanged = (hexChainId: string) => {
      if (state.status !== "connected") return;
      const id = Number(BigInt(hexChainId));
      setState({
        ...state,
        chainId: id,
        onWrongChain: id !== RH_CHAIN_ID,
      });
      void refreshBalance();
    };
    const onDisconnect = () => {
      void doDisconnect();
    };

    type WithEvents = EIP1193Provider & {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
    const p = provider as WithEvents;
    p.on?.("accountsChanged", onAccountsChanged as (...a: unknown[]) => void);
    p.on?.("chainChanged", onChainChanged as (...a: unknown[]) => void);
    p.on?.("disconnect", onDisconnect);
  }

  async function doConnect(kind: ConnectorKind) {
    setState({ status: "connecting", connector: kind });
    try {
      const provider =
        kind === "injected"
          ? getInjected()
          : await getOrCreateWalletConnect();
      if (!provider) {
        throw new Error(
          "No injected wallet detected. Install MetaMask, Rabby or Coinbase Wallet, or use WalletConnect.",
        );
      }

      if (kind === "walletconnect") {
        const wcLike = provider as EIP1193Provider & {
          connect?: () => Promise<unknown>;
        };
        if (typeof wcLike.connect === "function") {
          await wcLike.connect();
        }
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0]) throw new Error("Wallet returned no account.");
      const account = accounts[0] as Address;
      const chainIdHex = (await provider.request({
        method: "eth_chainId",
      })) as string;
      const chainId = Number(BigInt(chainIdHex));

      walletClient = makeWalletClient(provider);
      writePersisted({ connector: kind, account });
      const next: WalletState = {
        status: "connected",
        connector: kind,
        account,
        chainId,
        onWrongChain: chainId !== RH_CHAIN_ID,
        provider,
      };
      setState(next);
      attachProviderListeners(provider);
      await refreshBalance();
    } catch (err) {
      writePersisted(null);
      walletClient = null;
      setState({
        status: "error",
        connector: kind,
        error:
          err instanceof Error
            ? err.message
            : "Failed to connect wallet.",
      });
    }
  }

  async function doDisconnect() {
    if (state.status === "connected" && state.connector === "walletconnect") {
      const wcLike = state.provider as EIP1193Provider & {
        disconnect?: () => Promise<void>;
      };
      try {
        await wcLike.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    writePersisted(null);
    walletClient = null;
    nativeBalance = "—";
    setState({ status: "idle" });
  }

  async function switchToOsmiumChain() {
    if (state.status !== "connected") return;
    const hex = `0x${RH_CHAIN_ID.toString(16)}` as const;
    try {
      await state.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (err) {
      // EIP-3085: chain not added — attempt to add it
      const error = err as { code?: number };
      if (error?.code === 4902 || error?.code === -32603) {
        try {
          await state.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hex,
                chainName: robinhoodTestnet.name,
                nativeCurrency: robinhoodTestnet.nativeCurrency,
                rpcUrls: [RH_RPC_URL],
                blockExplorerUrls: [
                  robinhoodTestnet.blockExplorers.default.url,
                ],
              },
            ],
          });
        } catch {
          throw new Error("User rejected adding Robinhood Chain Testnet.");
        }
      } else {
        throw err;
      }
    }
  }

  /* attempt silent reconnect on boot for persisted sessions */
  async function bootstrap() {
    const persisted = readPersisted();
    if (!persisted) return;
    if (persisted.connector === "walletconnect" && !walletConnectAvailable) {
      writePersisted(null);
      return;
    }
    try {
      const provider =
        persisted.connector === "injected"
          ? getInjected()
          : await getOrCreateWalletConnect();
      if (!provider) {
        writePersisted(null);
        return;
      }
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      if (!accounts?.[0]) {
        writePersisted(null);
        return;
      }
      const account = accounts[0] as Address;
      const chainIdHex = (await provider.request({
        method: "eth_chainId",
      })) as string;
      const chainId = Number(BigInt(chainIdHex));
      walletClient = makeWalletClient(provider);
      const next: WalletState = {
        status: "connected",
        connector: persisted.connector,
        account,
        chainId,
        onWrongChain: chainId !== RH_CHAIN_ID,
        provider,
      };
      setState(next);
      attachProviderListeners(provider);
      await refreshBalance();
    } catch {
      writePersisted(null);
    }
  }

  void bootstrap();

  return {
    get state() {
      return state;
    },
    publicClient,
    get walletClient() {
      return walletClient;
    },
    get nativeBalance() {
      return nativeBalance;
    },
    connect: doConnect,
    disconnect: doDisconnect,
    switchToOsmiumChain,
    refreshBalance,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
