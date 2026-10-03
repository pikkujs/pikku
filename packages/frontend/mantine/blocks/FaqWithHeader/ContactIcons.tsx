import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { AtSign, MapPin, Phone, Sun, type LucideIcon } from 'lucide-react'
import { Stack, Text, ThemeIcon } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './ContactIcons.module.css'

type ContactIconProps = {
  icon: LucideIcon
  // Label is UI copy (m.*); value is opaque contact data (asI18n).
  title: I18nString
  description: I18nString
}

const ContactIcon: FC<ContactIconProps> = ({ icon: Icon, title, description }) => {
  return (
    <div className={classes.wrapper}>
      <ThemeIcon size={40} radius="md" className={classes.icon}>
        <Icon size={24} />
      </ThemeIcon>

      <div>
        <Text size="xs" className={classes.title}>
          {title}
        </Text>
        <Text className={classes.description}>{description}</Text>
      </div>
    </div>
  )
}

const contacts = [
  {
    title: m.faqwithheader__contact_email(),
    description: asI18n('hello@example.com'),
    icon: AtSign,
  },
  {
    title: m.faqwithheader__contact_phone(),
    description: asI18n('+49 (800) 335 35 35'),
    icon: Phone,
  },
  {
    title: m.faqwithheader__contact_address(),
    description: asI18n('844 Morris Park avenue'),
    icon: MapPin,
  },
  { title: m.faqwithheader__contact_hours(), description: asI18n('8 a.m. – 11 p.m.'), icon: Sun },
]

export const ContactIconsList: FC = () => {
  return (
    <Stack>
      {contacts.map((item, index) => (
        <ContactIcon key={index} {...item} />
      ))}
    </Stack>
  )
}
