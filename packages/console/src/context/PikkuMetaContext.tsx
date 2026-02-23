import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { usePikkuRPC } from "@/context/PikkuRpcProvider";
import type { FlattenedRPCMap } from "@/pikku/rpc-map.gen.d";

type AllMeta = FlattenedRPCMap['console:getAllMeta']['output']
type MetaCounts = AllMeta['counts']
type FunctionUsedBy = AllMeta['functionUsedBy'][string]
type PikkuMetaState = Omit<AllMeta, 'counts' | 'functionUsedBy'>

interface PikkuMetaContextType {
  meta: PikkuMetaState;
  counts: MetaCounts;
  functionUsedBy: Map<string, FunctionUsedBy>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PikkuMetaContext = createContext<PikkuMetaContextType | undefined>(
  undefined
);

export const usePikkuMeta = () => {
  const context = useContext(PikkuMetaContext);
  if (!context) {
    throw new Error("usePikkuMeta must be used within PikkuMetaProvider");
  }
  return context;
};

const EMPTY_META: PikkuMetaState = {
  functions: [],
  httpMeta: [],
  cliMeta: [],
  cliRenderers: {},
  channelsMeta: {},
  queueMeta: {},
  schedulerMeta: {},
  rpcMeta: {},
  mcpMeta: [],
  workflows: {},
  triggerMeta: {},
  triggerSourceMeta: {},
  middlewareGroupsMeta: { definitions: {}, instances: {}, httpGroups: {}, tagGroups: {} },
  permissionsGroupsMeta: { definitions: {}, httpGroups: {}, tagGroups: {} },
  agentsMeta: {},
  secretsMeta: {},
  variablesMeta: {},
};

const EMPTY_COUNTS: MetaCounts = {
  functions: 0,
  workflows: 0,
  httpRoutes: 0,
  channels: 0,
  mcpTools: 0,
  schedulers: 0,
  queues: 0,
  cliCommands: 0,
  rpcMethods: 0,
  triggers: 0,
  triggerSources: 0,
  agents: 0,
  secrets: 0,
  variables: 0,
};

export const PikkuMetaProvider: React.FunctionComponent<{
  children: React.ReactNode;
}> = ({ children }) => {
  const rpc = usePikkuRPC();
  const [meta, setMeta] = useState<PikkuMetaState>(EMPTY_META);
  const [counts, setCounts] = useState<MetaCounts>(EMPTY_COUNTS);
  const [serverFunctionUsedBy, setServerFunctionUsedBy] = useState<
    Record<string, FunctionUsedBy>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allMeta = await rpc("console:getAllMeta", null);
      setMeta({
        functions: allMeta.functions,
        httpMeta: allMeta.httpMeta,
        cliMeta: allMeta.cliMeta,
        cliRenderers: allMeta.cliRenderers,
        channelsMeta: allMeta.channelsMeta,
        queueMeta: allMeta.queueMeta,
        schedulerMeta: allMeta.schedulerMeta,
        rpcMeta: allMeta.rpcMeta,
        mcpMeta: allMeta.mcpMeta,
        workflows: allMeta.workflows,
        triggerMeta: allMeta.triggerMeta,
        triggerSourceMeta: allMeta.triggerSourceMeta,
        middlewareGroupsMeta: allMeta.middlewareGroupsMeta,
        permissionsGroupsMeta: allMeta.permissionsGroupsMeta,
        agentsMeta: allMeta.agentsMeta,
        secretsMeta: allMeta.secretsMeta,
        variablesMeta: allMeta.variablesMeta,
      });
      setCounts(allMeta.counts);
      setServerFunctionUsedBy(allMeta.functionUsedBy);
    } catch (e: any) {
      setError(e.message || "Failed to load metadata");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const functionUsedBy = useMemo(() => {
    const map = new Map<string, FunctionUsedBy>();
    for (const [funcName, data] of Object.entries(serverFunctionUsedBy)) {
      map.set(funcName, data);
    }
    return map;
  }, [serverFunctionUsedBy]);

  return (
    <PikkuMetaContext.Provider
      value={{ meta, counts, functionUsedBy, loading, error, refresh: loadMeta }}
    >
      {children}
    </PikkuMetaContext.Provider>
  );
};
