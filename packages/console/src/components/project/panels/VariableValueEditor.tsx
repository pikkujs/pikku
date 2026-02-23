import React, { useEffect, useState } from "react";
import {
  Stack,
  Box,
  Button,
  Textarea,
  Alert,
  SegmentedControl,
  Loader,
  Text,
  Code,
  Group,
  ActionIcon,
} from "@mantine/core";
import { Save, AlertTriangle, CheckCircle, Eye, Pencil } from "lucide-react";
import { useVariableValue, useSetVariable } from "@/hooks/useVariables";
import { useSchema } from "@/hooks/useWirings";
import { SchemaForm } from "@/components/ui/SchemaForm";
import { SectionLabel } from "@/components/project/panels/shared/SectionLabel";

interface VariableValueEditorProps {
  variableId: string | undefined;
  schemaName: string | undefined;
}

export const VariableValueEditor: React.FunctionComponent<VariableValueEditorProps> = ({
  variableId,
  schemaName,
}) => {
  const [retrieved, setRetrieved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<string>("form");
  const [jsonValue, setJsonValue] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: variableData, isLoading: variableLoading } = useVariableValue(variableId, retrieved);
  const { data: schema } = useSchema(schemaName);
  const setVariableMutation = useSetVariable();

  const hasSchema = !!schema;
  const currentValue = variableData?.exists ? variableData.value : null;

  useEffect(() => {
    if (variableData) {
      setJsonValue(currentValue != null ? JSON.stringify(currentValue, null, 2) : "");
    }
  }, [variableData, currentValue]);

  if (!variableId) {
    return null;
  }

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleFormSubmit = (formData: any) => {
    setVariableMutation.mutate(
      { variableId, value: formData },
      {
        onSuccess: () => {
          showSuccess("Variable saved successfully");
          setEditing(false);
        },
      }
    );
  };

  const handleJsonSubmit = () => {
    setJsonError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonValue);
    } catch {
      setJsonError("Invalid JSON");
      return;
    }
    setVariableMutation.mutate(
      { variableId, value: parsed },
      {
        onSuccess: () => {
          showSuccess("Variable saved successfully");
          setEditing(false);
        },
      }
    );
  };

  if (!retrieved) {
    return (
      <Box>
        <SectionLabel>Variable Value</SectionLabel>
        <Button
          variant="light"
          leftSection={<Eye size={16} />}
          onClick={() => setRetrieved(true)}
          size="xs"
        >
          Retrieve variable value
        </Button>
      </Box>
    );
  }

  if (variableLoading) {
    return (
      <Box>
        <SectionLabel>Variable Value</SectionLabel>
        <Loader size="sm" />
      </Box>
    );
  }

  const effectiveMode = hasSchema ? mode : "json";

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <SectionLabel>Variable Value</SectionLabel>
        <Group gap="xs" align="center">
          {!editing && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setEditing(true)}
              title="Edit variable value"
            >
              <Pencil size={14} />
            </ActionIcon>
          )}
          {hasSchema && (
            <SegmentedControl
              value={effectiveMode}
              onChange={setMode}
              data={[
                { label: "Form", value: "form" },
                { label: "JSON", value: "json" },
              ]}
              size="xs"
              style={{ width: "auto" }}
            />
          )}
        </Group>
      </Group>

      {successMessage && (
        <Alert icon={<CheckCircle size={16} />} color="green" variant="light">
          {successMessage}
        </Alert>
      )}

      {setVariableMutation.isError && (
        <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
          Failed to save variable
        </Alert>
      )}

      {!variableData?.exists && !editing && (
        <Text size="sm" c="dimmed">No value set yet.</Text>
      )}

      {!editing ? (
        <Stack gap="xs">
          {variableData?.exists && (
            effectiveMode === "form" && hasSchema ? (
              <Box style={{ pointerEvents: "none", opacity: 0.8 }}>
                <SchemaForm
                  schema={schema as any}
                  onSubmit={() => {}}
                  initialData={currentValue ?? undefined}
                >
                  <></>
                </SchemaForm>
              </Box>
            ) : (
              <Code block style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
                {JSON.stringify(currentValue, null, 2)}
              </Code>
            )
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          {effectiveMode === "form" && hasSchema ? (
            <SchemaForm
              schema={schema as any}
              onSubmit={handleFormSubmit}
              submitting={setVariableMutation.isPending}
              submitLabel="Save"
              initialData={currentValue ?? undefined}
            >
              <Group mt="sm" gap="xs" justify="flex-end">
                <Button variant="subtle" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  leftSection={<Save size={16} />}
                  loading={setVariableMutation.isPending}
                >
                  Save
                </Button>
              </Group>
            </SchemaForm>
          ) : (
            <Stack gap="xs">
              <Textarea
                value={jsonValue}
                onChange={(e) => {
                  setJsonValue(e.currentTarget.value);
                  setJsonError(null);
                }}
                placeholder='{"key": "value"}'
                autosize
                minRows={4}
                maxRows={12}
                styles={{ input: { fontFamily: "monospace", fontSize: "13px" } }}
              />
              {jsonError && (
                <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
                  {jsonError}
                </Alert>
              )}
              <Group gap="xs" justify="flex-end">
                <Button variant="subtle" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  leftSection={<Save size={16} />}
                  loading={setVariableMutation.isPending}
                  onClick={handleJsonSubmit}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};
