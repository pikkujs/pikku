import React from "react";
import { Box, Loader, Text } from "@mantine/core";
import { useSchema } from "@/hooks/useWirings";
import { SchemaViewer } from "@/components/ui/SchemaViewer";
import { SectionLabel } from "./SectionLabel";

export const SchemaSection: React.FunctionComponent<{
  label: string;
  schemaName?: string | null;
}> = ({ label, schemaName }) => {
  const { data: schema, isLoading } = useSchema(schemaName);

  if (!schemaName) return null;

  return (
    <Box>
      <SectionLabel>{label}</SectionLabel>
      {isLoading ? (
        <Loader size="xs" />
      ) : schema ? (
        <SchemaViewer schema={schema} />
      ) : (
        <Text size="sm" c="dimmed">No schema</Text>
      )}
    </Box>
  );
};
