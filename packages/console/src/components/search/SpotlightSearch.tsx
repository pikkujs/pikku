import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Spotlight,
  SpotlightActionData,
  spotlight,
} from "@mantine/spotlight";
import {
  FunctionSquare,
  GitBranch,
  Globe,
  Radio,
  Cpu,
  Terminal,
  Clock,
  ListOrdered,
  Bot,
} from "lucide-react";
import { usePikkuMeta } from "@/context/PikkuMetaContext";

const TYPE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; color: string; href: string }
> = {
  function: { icon: FunctionSquare, color: "blue", href: "/functions" },
  workflow: { icon: GitBranch, color: "violet", href: "/workflow" },
  http: { icon: Globe, color: "green", href: "/apis/http" },
  channel: { icon: Radio, color: "cyan", href: "/apis/channels" },
  mcp: { icon: Cpu, color: "orange", href: "/apis/mcp" },
  cli: { icon: Terminal, color: "teal", href: "/apis/cli" },
  scheduler: { icon: Clock, color: "yellow", href: "/jobs/schedulers" },
  queue: { icon: ListOrdered, color: "pink", href: "/jobs/queues" },
  agent: { icon: Bot, color: "grape", href: "/agents" },
};

export const SpotlightSearch: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta();
  const navigate = useNavigate();

  const actions: SpotlightActionData[] = useMemo(() => {
    const items: SpotlightActionData[] = [];

    meta.functions?.forEach((func: any) => {
      items.push({
        id: `fn-${func.pikkuFuncId}`,
        label: func.pikkuFuncId,
        description: "Function",
        leftSection: <FunctionSquare size={16} />,
        onClick: () => navigate("/functions"),
      });
    });

    if (meta.workflows) {
      for (const [name] of Object.entries(meta.workflows)) {
        items.push({
          id: `wf-${name}`,
          label: name,
          description: "Workflow",
          leftSection: <GitBranch size={16} />,
          onClick: () => navigate(`/workflow?id=${encodeURIComponent(name)}`),
        });
      }
    }

    meta.httpMeta?.forEach((route: any) => {
      const label = `${route.method?.toUpperCase()} ${route.route}`;
      items.push({
        id: `http-${label}`,
        label,
        description: `HTTP → ${route.pikkuFuncId || ""}`,
        leftSection: <Globe size={16} />,
        onClick: () => navigate("/apis/http"),
      });
    });

    if (meta.channelsMeta) {
      for (const [channelName] of Object.entries(meta.channelsMeta)) {
        items.push({
          id: `ch-${channelName}`,
          label: channelName,
          description: "Channel",
          leftSection: <Radio size={16} />,
          onClick: () => navigate("/apis/channels"),
        });
      }
    }

    meta.mcpMeta?.forEach((item: any) => {
      items.push({
        id: `mcp-${item.wireId || item.name}`,
        label: item.name || item.wireId,
        description: `MCP ${item.method || ""}`,
        leftSection: <Cpu size={16} />,
        onClick: () => navigate("/apis/mcp"),
      });
    });

    meta.cliMeta?.forEach((program: any) => {
      const walkCommands = (commands: any, path: string) => {
        if (!commands) return;
        for (const [cmdName, cmdData] of Object.entries(commands) as any[]) {
          const fullPath = path ? `${path} ${cmdName}` : cmdName;
          if (cmdData.pikkuFuncId) {
            items.push({
              id: `cli-${program.wireId}-${fullPath}`,
              label: `${program.wireId} ${fullPath}`,
              description: `CLI → ${cmdData.pikkuFuncId}`,
              leftSection: <Terminal size={16} />,
              onClick: () => navigate("/apis/cli"),
            });
          }
          if (cmdData.subcommands) walkCommands(cmdData.subcommands, fullPath);
        }
      };
      walkCommands(program.commands, "");
    });

    if (meta.schedulerMeta) {
      for (const [taskName, taskData] of Object.entries(meta.schedulerMeta) as any[]) {
        items.push({
          id: `sched-${taskName}`,
          label: taskName,
          description: `Scheduler${taskData.schedule ? ` (${taskData.schedule})` : ""}`,
          leftSection: <Clock size={16} />,
          onClick: () => navigate("/jobs/schedulers"),
        });
      }
    }

    if (meta.queueMeta) {
      for (const [workerName] of Object.entries(meta.queueMeta)) {
        items.push({
          id: `queue-${workerName}`,
          label: workerName,
          description: "Queue Worker",
          leftSection: <ListOrdered size={16} />,
          onClick: () => navigate("/jobs/queues"),
        });
      }
    }

    if (meta.agentsMeta) {
      for (const [agentName, agentData] of Object.entries(meta.agentsMeta) as any[]) {
        items.push({
          id: `agent-${agentName}`,
          label: agentName,
          description: `Agent${agentData.model ? ` (${agentData.model})` : ""}`,
          leftSection: <Bot size={16} />,
          onClick: () => navigate("/agents"),
        });
      }
    }

    return items;
  }, [meta, navigate]);

  return (
    <Spotlight
      actions={actions}
      nothingFound="No results found"
      searchProps={{
        placeholder: "Search functions, routes, workflows...",
      }}
      shortcut={["mod + K"]}
      highlightQuery
    />
  );
};

export { spotlight };
