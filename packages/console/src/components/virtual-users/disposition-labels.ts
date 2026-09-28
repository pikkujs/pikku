import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import { m } from '@/i18n/messages'

export const DISPOSITION_LABEL: Record<
  VirtualUserDisposition,
  typeof m.virtual_users_kind_realistic
> = {
  realistic: m.virtual_users_kind_realistic,
  careless: m.virtual_users_kind_careless,
  newcomer: m.virtual_users_kind_newcomer,
  stale: m.virtual_users_kind_stale,
  auditor: m.virtual_users_kind_auditor,
  adversarial: m.virtual_users_kind_adversarial,
  accountable: m.virtual_users_kind_accountable,
}

export const DISPOSITION_COLOR: Record<VirtualUserDisposition, string> = {
  realistic: 'blue',
  careless: 'orange',
  newcomer: 'green',
  stale: 'gray',
  auditor: 'violet',
  adversarial: 'red',
  accountable: 'green',
}

export const frequencyWord = (percent: number) =>
  percent === 0
    ? m.virtual_users_freq_never()
    : percent < 5
      ? m.virtual_users_freq_almost_never()
      : percent < 15
        ? m.virtual_users_freq_rarely()
        : percent < 35
          ? m.virtual_users_freq_sometimes()
          : percent < 60
            ? m.virtual_users_freq_half()
            : percent < 85
              ? m.virtual_users_freq_usually()
              : m.virtual_users_freq_almost_always()
