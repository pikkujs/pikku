import {
  Stack,
  Text,
  TextInput,
  Textarea,
  Box,
  Tabs,
  Code,
  Title,
} from "@mantine/core";
import type { PikkuWiringTypes } from "@pikku/core";

interface SchedulerWireDetailsFormProps {
  wireType: PikkuWiringTypes;
  wireId: string;
  metadata: any;
}

export const SchedulerWireDetailsForm: React.FunctionComponent<
  SchedulerWireDetailsFormProps
> = ({ wireType, wireId, metadata }) => {
  const taskName = wireId;
  const schedule = metadata.schedule || metadata.cron || "0 0 * * *";

  return (
    <Box h="100%">
      <Box
        px="md"
        py="md"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Title order={3} tt="uppercase">
          {wireType}
        </Title>
      </Box>

      <Tabs defaultValue="configuration">
        <Tabs.List px="md">
          <Tabs.Tab value="configuration">Configuration</Tabs.Tab>
          <Tabs.Tab value="meta">Meta</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="configuration" pt="md" px="md">
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} mb={4}>
                Schedule
              </Text>
              <Text size="lg">{taskName}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} mb={4}>
                Cron Expression
              </Text>
              <Code>{schedule}</Code>
            </Box>

            <TextInput
              label="Summary"
              value={metadata.docs?.summary || ""}
              readOnly
            />

            <Textarea
              label="Description"
              value={metadata.docs?.description || ""}
              minRows={3}
              readOnly
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="meta" pt="md" px="md">
          <Code block>{JSON.stringify(metadata, null, 2)}</Code>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};
