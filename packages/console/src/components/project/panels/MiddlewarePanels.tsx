import React from "react";
import {
  Stack,
  Text,
  Box,
  Group,
  Divider,
  Table,
} from "@mantine/core";
import { Layers } from "lucide-react";
import { usePikkuMeta } from "@/context/PikkuMetaContext";
import { usePanelContext } from "@/context/PanelContext";
import { PikkuBadge } from "@/components/ui/PikkuBadge";
import { SectionLabel } from "@/components/project/panels/shared/SectionLabel";

interface MiddlewarePanelProps {
  middlewareId: string;
  metadata?: any;
}

const DefinitionPanel: React.FunctionComponent<{ defId: string; def: any }> = ({ defId, def }) => {
  const { meta } = usePikkuMeta();
  const instances = meta.middlewareGroupsMeta?.instances || {};
  const httpGroups = meta.middlewareGroupsMeta?.httpGroups || {};
  const tagGroups = meta.middlewareGroupsMeta?.tagGroups || {};

  const usedByInstances = Object.entries(instances).filter(
    ([, inst]: [string, any]) => inst.definitionId === defId
  );

  const usedByInstanceIds = new Set(usedByInstances.map(([iid]) => iid));

  const usedByGroups: Array<{ type: string; key: string; group: any }> = [];
  for (const [pattern, group] of Object.entries(httpGroups) as any[]) {
    if (group.instanceIds?.some((id: string) => usedByInstanceIds.has(id))) {
      usedByGroups.push({ type: "http", key: pattern, group });
    }
  }
  for (const [tag, group] of Object.entries(tagGroups) as any[]) {
    if (group.instanceIds?.some((id: string) => usedByInstanceIds.has(id))) {
      usedByGroups.push({ type: "tag", key: tag, group });
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Layers size={20} />
          <Text size="lg" fw={600}>{def.name || def.exportedName || defId}</Text>
        </Group>
        {def.description && (
          <Text size="sm" c="dimmed" mt={4}>{def.description}</Text>
        )}
      </Box>

      <Group gap={4}>
        {def.factory && (
          <PikkuBadge type="flag" flag="factory" />
        )}
        {def.exportedName === null && (
          <PikkuBadge type="flag" flag="local" />
        )}
        {def.exportedName && (
          <PikkuBadge type="dynamic" badge="exportedName" value={def.exportedName} />
        )}
        {def.package && (
          <PikkuBadge type="dynamic" badge="package" value={def.package} />
        )}
      </Group>

      {def.services?.services?.length > 0 && (
        <Box>
          <SectionLabel>Services</SectionLabel>
          <Group gap={4}>
            {def.services.services.map((svc: string) => (
              <PikkuBadge key={svc} type="dynamic" badge="service" value={svc} />
            ))}
          </Group>
        </Box>
      )}

      {def.wires && (
        <Box>
          <SectionLabel>Wires</SectionLabel>
          {def.wires.wires?.length > 0 ? (
            <Group gap={4}>
              {def.wires.wires.some((w: string) => ["session", "setSession", "clearSession", "getSession", "hasSessionChanged"].includes(w)) && (
                <PikkuBadge type="flag" flag="session" />
              )}
              {def.wires.wires.filter((w: string) => !["session", "setSession", "clearSession", "getSession", "hasSessionChanged"].includes(w)).map((w: string) => (
                <PikkuBadge key={w} type="dynamic" badge="wire" value={w} />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">None</Text>
          )}
        </Box>
      )}

      {usedByInstances.length > 0 && (
        <>
          <Divider />
          <Box>
            <SectionLabel>Instances ({usedByInstances.length})</SectionLabel>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Type</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {usedByInstances.map(([instanceId, inst]: [string, any]) => (
                  <Table.Tr key={instanceId}>
                    <Table.Td ff="monospace" fz="sm">{instanceId}</Table.Td>
                    <Table.Td>
                      {inst.isFactoryCall && (
                        <PikkuBadge type="flag" flag="factoryCall" />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </>
      )}

      {usedByGroups.length > 0 && (
        <Box>
          <SectionLabel>Used in Groups</SectionLabel>
          <Group gap={4}>
            {usedByGroups.map((g) => (
              <PikkuBadge
                key={`${g.type}::${g.key}`}
                type="label"
                color={g.type === "http" ? "blue" : "green"}
                leftSection={<Layers size={10} />}
              >
                {g.type === "http" ? `HTTP ${g.key}` : `Tag: ${g.key}`}
              </PikkuBadge>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  );
};

const GroupPanel: React.FunctionComponent<{ groupType: string; groupKey: string }> = ({ groupType, groupKey }) => {
  const { meta } = usePikkuMeta();
  const { openMiddleware } = usePanelContext();
  const groups = groupType === "http"
    ? meta.middlewareGroupsMeta?.httpGroups || {}
    : meta.middlewareGroupsMeta?.tagGroups || {};
  const group = groups[groupKey];
  const instances = meta.middlewareGroupsMeta?.instances || {};
  const definitions = meta.middlewareGroupsMeta?.definitions || {};

  const resolvedDefs: Array<{ defId: string; def: any; instanceId: string; instance: any }> = [];
  const seen = new Set<string>();
  for (const instanceId of group?.instanceIds || []) {
    const inst = instances[instanceId];
    if (inst?.definitionId && !seen.has(inst.definitionId)) {
      seen.add(inst.definitionId);
      resolvedDefs.push({
        defId: inst.definitionId,
        def: definitions[inst.definitionId],
        instanceId,
        instance: inst,
      });
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <PikkuBadge type="label" color={groupType === "http" ? "blue" : "green"}>
          {groupType === "http" ? `HTTP ${groupKey}` : `Tag: ${groupKey}`}
        </PikkuBadge>
      </Box>

      {group?.exportName && (
        <Box>
          <SectionLabel>Export</SectionLabel>
          <Text size="sm" ff="monospace">{group.exportName}</Text>
        </Box>
      )}

      {resolvedDefs.length > 0 && (
        <Box>
          <SectionLabel>Middleware ({resolvedDefs.length})</SectionLabel>
          <Table verticalSpacing={4} horizontalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Definition</Table.Th>
                <Table.Th>Type</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {resolvedDefs.map(({ defId, def, instance }) => (
                <Table.Tr
                  key={defId}
                  style={{ cursor: "pointer" }}
                  onClick={() => openMiddleware(defId, { ...def, _id: defId })}
                >
                  <Table.Td ff="monospace" fz="sm">{def?.name || def?.exportedName || defId}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {instance?.isFactoryCall && (
                        <PikkuBadge type="flag" flag="factoryCall" />
                      )}
                      {def?.factory && (
                        <PikkuBadge type="flag" flag="factory" />
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Stack>
  );
};

export const MiddlewareConfiguration: React.FunctionComponent<MiddlewarePanelProps> = ({
  middlewareId,
  metadata = {},
}) => {
  if (metadata._groupType) {
    return <GroupPanel groupType={metadata._groupType} groupKey={metadata._groupKey} />;
  }
  return <DefinitionPanel defId={metadata._id || middlewareId} def={metadata} />;
};
