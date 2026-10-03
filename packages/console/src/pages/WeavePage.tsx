import React from 'react'
import { useNavigate } from '../router'
import { m } from '@/i18n/messages'
import { WeavingBuild } from '../components/weave/WeavingBuild'

export const WeavePage: React.FC = () => {
  const navigate = useNavigate()
  return <WeavingBuild title={m.nav_weave()} building={false} onOpenApp={() => navigate('/pages')} />
}
