import React from "react";
import { Badge, type BadgeProps } from "@mantine/core";
import {
  httpMethodDefs, mcpTypeDefs, funcWrapperDefs, wiringTypeDefs,
  schemaTypeDefs, workflowInputTypeDefs, statusDefs, flagDefs, dynamicDefs,
  type EnumBadgeDef,
} from "@/components/ui/badge-defs";

const ICON_SIZES: Record<string, number> = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
};

const enumMaps: Record<string, Record<string, EnumBadgeDef>> = {
  httpMethod: httpMethodDefs,
  mcpType: mcpTypeDefs,
  funcWrapper: funcWrapperDefs,
  wiringType: wiringTypeDefs,
  schemaType: schemaTypeDefs,
  workflowInputType: workflowInputTypeDefs,
  status: statusDefs,
};

type EnumType = "httpMethod" | "mcpType" | "funcWrapper" | "wiringType" | "schemaType" | "workflowInputType" | "status";

type PikkuBadgeProps = (
  | { type: EnumType; value: string }
  | { type: "flag"; flag: string }
  | { type: "dynamic"; badge: string; value: string | number }
  | { type: "label"; children: React.ReactNode; color?: string; variant?: BadgeProps["variant"] }
) & Omit<BadgeProps, "children"> & {
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
};

const humanize = (str: string): string =>
  str.includes("/")
    ? str
    : str
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

const ColoredIcon: React.FunctionComponent<{
  icon: React.ComponentType<{ size?: number }>;
  size: number;
  color: string;
}> = ({ icon: Icon, size, color }) => (
  <span style={{ color: `var(--mantine-color-${color}-6)`, display: "flex" }}>
    <Icon size={size} />
  </span>
);

export const PikkuBadge: React.FunctionComponent<PikkuBadgeProps> = (props) => {
  const { type, ...rest } = props;
  const size = "md";
  const iconSize = ICON_SIZES[size] || 10;

  if (type === "label") {
    const { children, color, variant, ...badgeProps } = rest as { children: React.ReactNode; color?: string; variant?: BadgeProps["variant"] } & Omit<BadgeProps, "children">;
    return (
      <Badge
        size={size}
        tt="none"
        variant={(variant || "light") as BadgeProps["variant"]}
        color="gray"
        {...badgeProps}
      >
        {children}
      </Badge>
    );
  }

  if (type === "flag") {
    const { flag, ...badgeProps } = rest as { flag: string } & Omit<BadgeProps, "children">;
    const def = flagDefs[flag];
    if (!def) return null;
    const Icon = def.icon;
    return (
      <Badge
        size={size}
        tt="none"
        variant="light"
        color="gray"
        leftSection={Icon ? <ColoredIcon icon={Icon} size={iconSize} color={def.color} /> : undefined}
        {...badgeProps}
      >
        {def.label}
      </Badge>
    );
  }

  if (type === "dynamic") {
    const { badge, value, ...badgeProps } = rest as { badge: string; value: string | number } & Omit<BadgeProps, "children">;
    const def = dynamicDefs[badge];
    if (!def) return null;
    const Icon = def.icon;

    let label: string;
    if (def.pluralSuffix && typeof value === "number") {
      label = `${value}${value === 1 ? (def.suffix || def.pluralSuffix) : def.pluralSuffix}`;
    } else {
      label = `${def.prefix || ""}${value}${def.suffix || ""}`;
    }

    return (
      <Badge
        size={size}
        tt="none"
        variant={(def.variant || "light") as BadgeProps["variant"]}
        color="gray"
        leftSection={Icon ? <ColoredIcon icon={Icon} size={iconSize} color={def.color || "gray"} /> : undefined}
        {...badgeProps}
      >
        {humanize(label)}
      </Badge>
    );
  }

  const { value, ...badgeProps } = rest as { value: string } & Omit<BadgeProps, "children">;
  const map = enumMaps[type];
  const def = map?.[value];
  const label = def?.label || value;

  return (
    <Badge
      size={size}
      tt="none"
      variant="light"
      color="gray"
      {...badgeProps}
    >
      {humanize(label)}
    </Badge>
  );
};
