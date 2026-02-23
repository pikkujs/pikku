import React from "react";
import { Stack, Text, Box, Group, Anchor } from "@mantine/core";
import { Link } from "react-router-dom";
import { usePikkuMeta } from "@/context/PikkuMetaContext";
import { PikkuBadge } from "@/components/ui/PikkuBadge";
import { wiringTypeColor } from "@/components/ui/badge-defs";

const TYPE_HREF: Record<string, string> = {
  http: "/apis/http",
  channel: "/apis/channels",
  mcp: "/apis/mcp",
  cli: "/apis/cli",
  rpc: "/apis/http",
  scheduler: "/jobs/schedulers",
  queue: "/jobs/queues",
  trigger: "/jobs/triggers",
  triggerSource: "/jobs/triggers",
};

export const FunctionCrossLinks: React.FunctionComponent<{
  pikkuFuncId: string;
}> = ({ pikkuFuncId }) => {
  const { functionUsedBy, meta } = usePikkuMeta();
  const usedBy = functionUsedBy.get(pikkuFuncId);

  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === pikkuFuncId
  );
  const services = funcMeta?.services?.services as string[] | undefined;

  if (!usedBy && !services?.length) return null;

  return (
    <Stack gap="md" p="md">
      {usedBy && usedBy.transports.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Wired To
          </Text>
          <Group gap={4} style={{ flexWrap: "wrap" }}>
            {usedBy.transports.map((t) => (
              <Anchor
                key={t.id}
                component={Link}
                to={TYPE_HREF[t.type] || "#"}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(t.type)}
                  style={{ cursor: "pointer" }}
                >
                  {t.name}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {usedBy && usedBy.jobs.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Jobs
          </Text>
          <Group gap={4} style={{ flexWrap: "wrap" }}>
            {usedBy.jobs.map((j) => (
              <Anchor
                key={j.id}
                component={Link}
                to={TYPE_HREF[j.type] || "#"}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(j.type)}
                  style={{ cursor: "pointer" }}
                >
                  {j.name}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {services && services.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Services
          </Text>
          <Group gap={4} style={{ flexWrap: "wrap" }}>
            {services.map((svc) => (
              <Anchor
                key={svc}
                component={Link}
                to="/runtime/services"
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  variant="outline"
                  color="gray"
                  style={{ cursor: "pointer" }}
                >
                  {svc}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  );
};

export const WiringCrossLinks: React.FunctionComponent<{
  pikkuFuncId?: string;
}> = ({ pikkuFuncId }) => {
  const { functionUsedBy, meta } = usePikkuMeta();

  if (!pikkuFuncId) return null;

  const usedBy = functionUsedBy.get(pikkuFuncId);
  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === pikkuFuncId
  );
  const services = funcMeta?.services?.services as string[] | undefined;

  if (!usedBy && !services?.length) return null;

  return (
    <Stack gap="md" p="md">
      <Anchor
        component={Link}
        to="/functions"
        size="sm"
        fw={500}
        underline="hover"
      >
        Handler: {pikkuFuncId}
      </Anchor>
      {services && services.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Services Used
          </Text>
          <Group gap={4} style={{ flexWrap: "wrap" }}>
            {services.map((svc) => (
              <Anchor
                key={svc}
                component={Link}
                to="/runtime/services"
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  variant="outline"
                  color="gray"
                  style={{ cursor: "pointer" }}
                >
                  {svc}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {usedBy && usedBy.transports.length > 1 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Also Wired To
          </Text>
          <Group gap={4} style={{ flexWrap: "wrap" }}>
            {usedBy.transports.map((t) => (
              <Anchor
                key={t.id}
                component={Link}
                to={TYPE_HREF[t.type] || "#"}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(t.type)}
                  style={{ cursor: "pointer" }}
                >
                  {t.name}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  );
};
