import React from "react";
import { Text } from "@mantine/core";

export const SectionLabel: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
  <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
    {children}
  </Text>
);
