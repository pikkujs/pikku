import { m } from '@/i18n/messages'
import { PropMeta } from './internal.js'

// Single source of truth — a prop must be in this map to appear in the panel.
// `options` drives a toggle; `type: 'color'` drives a swatch picker; absence = free text.
export const PROP_META: Record<string, PropMeta> = {
  // Typography
  size: {
    label: m.design_panel_prop_size_label(),
    description: m.design_panel_prop_size_desc(),
    tokenScale: 'spacing',
  },
  fz: {
    label: m.design_panel_prop_fz_label(),
    description: m.design_panel_prop_fz_desc(),
    tokenScale: 'fontSizes',
  },
  fw: { label: m.design_panel_prop_fw_label(), description: m.design_panel_prop_fw_desc() },
  fs: { label: m.design_panel_prop_fs_label(), description: m.design_panel_prop_fs_desc() },
  lh: { label: m.design_panel_prop_lh_label(), description: m.design_panel_prop_lh_desc() },
  ta: {
    label: m.design_panel_prop_ta_label(),
    description: m.design_panel_prop_ta_desc(),
    options: ['left', 'center', 'right', 'justify'],
  },
  tt: {
    label: m.design_panel_prop_tt_label(),
    description: m.design_panel_prop_tt_desc(),
    options: ['none', 'uppercase', 'lowercase', 'capitalize'],
  },
  td: {
    label: m.design_panel_prop_td_label(),
    description: m.design_panel_prop_td_desc(),
    options: ['none', 'underline', 'line-through'],
  },
  ff: { label: m.design_panel_prop_ff_label(), description: m.design_panel_prop_ff_desc() },
  c: {
    label: m.design_panel_prop_c_label(),
    description: m.design_panel_prop_c_desc(),
    type: 'color',
  },
  truncate: {
    label: m.design_panel_prop_truncate_label(),
    description: m.design_panel_prop_truncate_desc(),
    options: ['end', 'start'],
  },
  lineClamp: {
    label: m.design_panel_prop_line_clamp_label(),
    description: m.design_panel_prop_line_clamp_desc(),
  },
  // Sizing
  w: { label: m.design_panel_prop_w_label(), description: m.design_panel_prop_w_desc() },
  h: { label: m.design_panel_prop_h_label(), description: m.design_panel_prop_h_desc() },
  maw: { label: m.design_panel_prop_maw_label(), description: m.design_panel_prop_maw_desc() },
  mah: { label: m.design_panel_prop_mah_label(), description: m.design_panel_prop_mah_desc() },
  miw: { label: m.design_panel_prop_miw_label(), description: m.design_panel_prop_miw_desc() },
  mih: { label: m.design_panel_prop_mih_label(), description: m.design_panel_prop_mih_desc() },
  // Spacing
  p: {
    label: m.design_panel_prop_p_label(),
    description: m.design_panel_prop_p_desc(),
    tokenScale: 'spacing',
  },
  px: {
    label: m.design_panel_prop_px_label(),
    description: m.design_panel_prop_px_desc(),
    tokenScale: 'spacing',
  },
  py: {
    label: m.design_panel_prop_py_label(),
    description: m.design_panel_prop_py_desc(),
    tokenScale: 'spacing',
  },
  pt: {
    label: m.design_panel_prop_pt_label(),
    description: m.design_panel_prop_pt_desc(),
    tokenScale: 'spacing',
  },
  pb: {
    label: m.design_panel_prop_pb_label(),
    description: m.design_panel_prop_pb_desc(),
    tokenScale: 'spacing',
  },
  pl: {
    label: m.design_panel_prop_pl_label(),
    description: m.design_panel_prop_pl_desc(),
    tokenScale: 'spacing',
  },
  pr: {
    label: m.design_panel_prop_pr_label(),
    description: m.design_panel_prop_pr_desc(),
    tokenScale: 'spacing',
  },
  m: {
    label: m.design_panel_prop_m_label(),
    description: m.design_panel_prop_m_desc(),
    tokenScale: 'spacing',
  },
  mx: {
    label: m.design_panel_prop_mx_label(),
    description: m.design_panel_prop_mx_desc(),
    tokenScale: 'spacing',
  },
  my: {
    label: m.design_panel_prop_my_label(),
    description: m.design_panel_prop_my_desc(),
    tokenScale: 'spacing',
  },
  mt: {
    label: m.design_panel_prop_mt_label(),
    description: m.design_panel_prop_mt_desc(),
    tokenScale: 'spacing',
  },
  mb: {
    label: m.design_panel_prop_mb_label(),
    description: m.design_panel_prop_mb_desc(),
    tokenScale: 'spacing',
  },
  ml: {
    label: m.design_panel_prop_ml_label(),
    description: m.design_panel_prop_ml_desc(),
    tokenScale: 'spacing',
  },
  mr: {
    label: m.design_panel_prop_mr_label(),
    description: m.design_panel_prop_mr_desc(),
    tokenScale: 'spacing',
  },
  // Flex / Grid
  gap: {
    label: m.design_panel_prop_gap_label(),
    description: m.design_panel_prop_gap_desc(),
    tokenScale: 'spacing',
  },
  rowGap: {
    label: m.design_panel_prop_row_gap_label(),
    description: m.design_panel_prop_row_gap_desc(),
    tokenScale: 'spacing',
  },
  columnGap: {
    label: m.design_panel_prop_column_gap_label(),
    description: m.design_panel_prop_column_gap_desc(),
    tokenScale: 'spacing',
  },
  justify: {
    label: m.design_panel_prop_justify_label(),
    description: m.design_panel_prop_justify_desc(),
    options: ['flex-start', 'center', 'flex-end', 'space-between'],
  },
  align: {
    label: m.design_panel_prop_align_label(),
    description: m.design_panel_prop_align_desc(),
    options: ['stretch', 'flex-start', 'center', 'flex-end'],
  },
  direction: {
    label: m.design_panel_prop_direction_label(),
    description: m.design_panel_prop_direction_desc(),
    options: ['row', 'column', 'row-reverse', 'column-reverse'],
  },
  wrap: {
    label: m.design_panel_prop_wrap_label(),
    description: m.design_panel_prop_wrap_desc(),
    options: ['wrap', 'nowrap'],
  },
  span: { label: m.design_panel_prop_span_label(), description: m.design_panel_prop_span_desc() },
  offset: {
    label: m.design_panel_prop_offset_label(),
    description: m.design_panel_prop_offset_desc(),
  },
  grow: {
    label: m.design_panel_prop_grow_label(),
    description: m.design_panel_prop_grow_desc(),
    options: ['true', 'false'],
  },
  shrink: {
    label: m.design_panel_prop_shrink_label(),
    description: m.design_panel_prop_shrink_desc(),
    options: ['true', 'false'],
  },
  // Visual
  variant: {
    label: m.design_panel_prop_variant_label(),
    description: m.design_panel_prop_variant_desc(),
  },
  color: {
    label: m.design_panel_prop_color_label(),
    description: m.design_panel_prop_color_desc(),
    type: 'color',
  },
  bg: {
    label: m.design_panel_prop_bg_label(),
    description: m.design_panel_prop_bg_desc(),
    type: 'color',
  },
  radius: {
    label: m.design_panel_prop_radius_label(),
    description: m.design_panel_prop_radius_desc(),
    tokenScale: 'radius',
  },
  opacity: {
    label: m.design_panel_prop_opacity_label(),
    description: m.design_panel_prop_opacity_desc(),
  },
  shadow: {
    label: m.design_panel_prop_shadow_label(),
    description: m.design_panel_prop_shadow_desc(),
  },
  bd: { label: m.design_panel_prop_bd_label(), description: m.design_panel_prop_bd_desc() },
  bds: { label: m.design_panel_prop_bds_label(), description: m.design_panel_prop_bds_desc() },
  bdw: { label: m.design_panel_prop_bdw_label(), description: m.design_panel_prop_bdw_desc() },
  bdc: {
    label: m.design_panel_prop_bdc_label(),
    description: m.design_panel_prop_bdc_desc(),
    type: 'color',
  },
  withBorder: {
    label: m.design_panel_prop_with_border_label(),
    description: m.design_panel_prop_with_border_desc(),
    options: ['true', 'false'],
  },
  withShadow: {
    label: m.design_panel_prop_with_shadow_label(),
    description: m.design_panel_prop_with_shadow_desc(),
    options: ['true', 'false'],
  },
  // Position / display
  pos: {
    label: m.design_panel_prop_pos_label(),
    description: m.design_panel_prop_pos_desc(),
    options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  },
  top: { label: m.design_panel_prop_top_label(), description: m.design_panel_prop_top_desc() },
  left: { label: m.design_panel_prop_left_label(), description: m.design_panel_prop_left_desc() },
  right: {
    label: m.design_panel_prop_right_label(),
    description: m.design_panel_prop_right_desc(),
  },
  bottom: {
    label: m.design_panel_prop_bottom_label(),
    description: m.design_panel_prop_bottom_desc(),
  },
  inset: {
    label: m.design_panel_prop_inset_label(),
    description: m.design_panel_prop_inset_desc(),
  },
  display: {
    label: m.design_panel_prop_display_label(),
    description: m.design_panel_prop_display_desc(),
    options: ['flex', 'block', 'inline-flex', 'none'],
  },
  // Component-level
  fullWidth: {
    label: m.design_panel_prop_full_width_label(),
    description: m.design_panel_prop_full_width_desc(),
    options: ['true', 'false'],
  },
  padding: {
    label: m.design_panel_prop_padding_label(),
    description: m.design_panel_prop_padding_desc(),
    tokenScale: 'spacing',
  },
}
