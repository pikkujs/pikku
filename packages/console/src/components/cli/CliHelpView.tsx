import React, { useMemo } from "react";
import { Box, Stack, Group, Paper, Breadcrumbs, Anchor, Divider } from "@mantine/core";
import { Paintbrush } from "lucide-react";
import type { CLIMeta, CLICommandMeta } from "@pikku/core/cli";
import { FunctionLink } from "@/components/project/panels/shared/FunctionLink";
import { SectionLabel } from "@/components/project/panels/shared/SectionLabel";
import { PikkuBadge } from "@/components/ui/PikkuBadge";
import { CliHelpText } from "./CliHelpText";

interface RendererMeta {
  name: string;
  exportedName?: string;
  filePath: string;
  services: { optimized: boolean; services: string[] };
}

const getCommandAtPath = (
  cliMeta: CLIMeta,
  programId: string,
  commandPath: string[]
): CLICommandMeta | null => {
  const program = cliMeta.programs[programId];
  if (!program || commandPath.length === 0) return null;
  let current = program.commands[commandPath[0]];
  if (!current) return null;
  for (let i = 1; i < commandPath.length; i++) {
    if (!current.subcommands?.[commandPath[i]]) return null;
    current = current.subcommands[commandPath[i]];
  }
  return current;
};

interface CliHelpViewProps {
  programId: string;
  cliMeta: CLIMeta;
  cliRenderers: Record<string, RendererMeta>;
  commandPath: string[];
  onNavigate: (path: string[]) => void;
}

export const CliHelpView: React.FunctionComponent<CliHelpViewProps> = ({
  programId,
  cliMeta,
  cliRenderers,
  commandPath,
  onNavigate,
}) => {
  const command = useMemo(
    () => getCommandAtPath(cliMeta, programId, commandPath),
    [cliMeta, programId, commandPath]
  );
  const program = cliMeta.programs[programId];

  const rendererName = command?.renderName || program?.defaultRenderName;
  const renderer = rendererName ? cliRenderers[rendererName] : undefined;

  const pikkuFuncId = command?.pikkuFuncId || undefined;
  const hasImpl = !!(pikkuFuncId || renderer);

  return (
    <Stack gap="md" p="md" style={{ height: "100%", overflow: "auto" }}>
      <Breadcrumbs>
        <Anchor
          size="sm"
          onClick={() => onNavigate([])}
          style={{ cursor: "pointer" }}
        >
          {programId}
        </Anchor>
        {commandPath.map((part, i) => (
          <Anchor
            key={i}
            size="sm"
            onClick={() => onNavigate(commandPath.slice(0, i + 1))}
            style={{ cursor: i === commandPath.length - 1 ? "default" : "pointer" }}
            fw={i === commandPath.length - 1 ? 600 : 400}
          >
            {part}
          </Anchor>
        ))}
      </Breadcrumbs>

      <Paper withBorder p="md" radius="sm" bg="var(--mantine-color-gray-0)">
        <CliHelpText
          programId={programId}
          cliMeta={cliMeta}
          commandPath={commandPath}
          onNavigate={onNavigate}
        />
      </Paper>

      {hasImpl && (
        <>
          <Divider />
          <Stack gap="sm">
            {pikkuFuncId && (
              <FunctionLink pikkuFuncId={pikkuFuncId} />
            )}

            {renderer && (
              <Box>
                <SectionLabel>Renderer</SectionLabel>
                <Group gap={6}>
                  <PikkuBadge
                    type="label"
                    size="sm"
                    variant="outline"
                    color="gray"
                    leftSection={<Paintbrush size={10} />}
                  >
                    {renderer.name}
                  </PikkuBadge>
                  {renderer.exportedName && renderer.exportedName !== renderer.name && (
                    <PikkuBadge type="dynamic" badge="exportedName" value={renderer.exportedName} />
                  )}
                </Group>
              </Box>
            )}

            {renderer?.services && renderer.services.services.length > 0 && (
              <Box>
                <SectionLabel>Renderer Services</SectionLabel>
                <Group gap={6}>
                  {renderer.services.services.map((svc) => (
                    <PikkuBadge key={svc} type="dynamic" badge="service" value={svc} />
                  ))}
                </Group>
              </Box>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
};
