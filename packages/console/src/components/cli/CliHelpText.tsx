import React, { useMemo } from "react";
import { Box } from "@mantine/core";
import { generateCommandHelp } from "@pikku/core/cli";
import type { CLIMeta, CLICommandMeta } from "@pikku/core/cli";

interface HelpSegment {
  text: string;
  commandName?: string;
}

const parseHelpText = (
  helpText: string,
  knownCommands: string[]
): HelpSegment[] => {
  const lines = helpText.split("\n");
  const segments: HelpSegment[] = [];
  let inCommandSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.trim() === "Commands:" ||
      line.trim() === "Subcommands:"
    ) {
      inCommandSection = true;
      segments.push({ text: line + "\n" });
      continue;
    }

    if (
      inCommandSection &&
      line.trim() !== "" &&
      !line.startsWith("  ")
    ) {
      inCommandSection = false;
    }

    if (inCommandSection && line.startsWith("  ")) {
      const match = line.match(/^(\s{2})(\S+)(\s.*)?$/);
      if (match) {
        const [, indent, cmdName, rest] = match;
        if (knownCommands.includes(cmdName)) {
          segments.push({ text: indent });
          segments.push({ text: cmdName, commandName: cmdName });
          segments.push({ text: (rest || "") + "\n" });
          continue;
        }
      }
    }

    segments.push({ text: line + (i < lines.length - 1 ? "\n" : "") });
  }

  return segments;
};

interface CliHelpTextProps {
  programId: string;
  cliMeta: CLIMeta;
  commandPath: string[];
  onNavigate: (commandPath: string[]) => void;
}

export const CliHelpText: React.FunctionComponent<CliHelpTextProps> = ({
  programId,
  cliMeta,
  commandPath,
  onNavigate,
}) => {
  const { segments, knownCommands } = useMemo(() => {
    const helpText = generateCommandHelp(programId, cliMeta, commandPath);
    const program = cliMeta.programs[programId];
    if (!program) return { segments: [{ text: helpText }], knownCommands: [] };

    let childCommands: Record<string, CLICommandMeta> | undefined = program.commands;
    for (const part of commandPath) {
      const cmd: CLICommandMeta | undefined = childCommands?.[part];
      if (!cmd) { childCommands = undefined; break; }
      childCommands = cmd.subcommands;
    }

    const cmds = childCommands ? Object.keys(childCommands) : [];

    return {
      segments: parseHelpText(helpText, cmds),
      knownCommands: cmds,
    };
  }, [programId, cliMeta, commandPath]);

  return (
    <Box
      component="pre"
      style={{
        fontFamily: "var(--mantine-font-family-monospace)",
        fontSize: "var(--mantine-font-size-sm)",
        lineHeight: 1.6,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {segments.map((seg, i) =>
        seg.commandName ? (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate([...commandPath, seg.commandName!])}
            onKeyDown={(e) => {
              if (e.key === "Enter") onNavigate([...commandPath, seg.commandName!]);
            }}
            style={{
              color: "var(--mantine-color-blue-6)",
              cursor: "pointer",
              textDecoration: "none",
              borderBottom: "1px dashed var(--mantine-color-blue-3)",
            }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </Box>
  );
};
