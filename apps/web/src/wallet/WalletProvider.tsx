import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletAdapter,
  walletConnectAvailable,
  type WalletAdapter,
  type WalletState,
} from "./walletAdapter";

type WalletContextValue = {
  adapter: WalletAdapter;
  state: WalletState;
  nativeBalance: string;
  walletConnectAvailable: boolean;
  modal: { open: boolean; openModal: () => void; closeModal: () => void };
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  /* Adapter is instantiated once for the page lifetime — preserves the
     EIP-1193 listeners across React re-renders. */
  const adapter = useMemo(() => createWalletAdapter(), []);
  const [state, setState] = useState<WalletState>(adapter.state);
  const [nativeBalance, setNativeBalance] = useState<string>(
    adapter.nativeBalance,
  );
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const off = adapter.onChange((s) => {
      setState(s);
      setNativeBalance(adapter.nativeBalance);
    });
    return () => {
      off();
    };
  }, [adapter]);

  /* Re-poll balance every 12s while connected — testnet block time is
     short and operators expect a near-live gas indicator. */
  useEffect(() => {
    if (state.status !== "connected") return;
    const id = setInterval(() => {
      void adapter.refreshBalance();
    }, 12_000);
    return () => clearInterval(id);
  }, [state.status, adapter]);

  const value: WalletContextValue = useMemo(
    () => ({
      adapter,
      state,
      nativeBalance,
      walletConnectAvailable,
      modal: {
        open: modalOpen,
        openModal: () => setModalOpen(true),
        closeModal: () => setModalOpen(false),
      },
    }),
    [adapter, state, nativeBalance, modalOpen],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
