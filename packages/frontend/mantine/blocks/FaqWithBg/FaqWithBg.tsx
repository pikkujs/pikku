import { Plus } from 'lucide-react'
import { Accordion, Container, ThemeIcon, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './FaqWithBg.module.css'

const faqs = [
  { value: 'reset-password', q: m.faqwithbg__q1, a: m.faqwithbg__a1 },
  { value: 'another-account', q: m.faqwithbg__q2, a: m.faqwithbg__a2 },
  { value: 'newsletter', q: m.faqwithbg__q3, a: m.faqwithbg__a3 },
  { value: 'credit-card', q: m.faqwithbg__q4, a: m.faqwithbg__a4 },
  { value: 'payment', q: m.faqwithbg__q5, a: m.faqwithbg__a5 },
]

export function FaqWithBg() {
  return (
    <div className={classes.wrapper}>
      <Container size="sm">
        <Title ta="center" className={classes.title}>
          {m.faqwithbg__title()}
        </Title>

        <Accordion
          chevronPosition="right"
          defaultValue="reset-password"
          chevronSize={26}
          variant="separated"
          disableChevronRotation
          styles={{ label: { color: 'var(--mantine-color-black)' }, item: { border: 0 } }}
          chevron={
            <ThemeIcon radius="xl" className={classes.gradient} size={26}>
              <Plus size={18} strokeWidth={1.5} />
            </ThemeIcon>
          }
        >
          {faqs.map((faq) => (
            <Accordion.Item className={classes.item} value={faq.value} key={faq.value}>
              <Accordion.Control>{faq.q()}</Accordion.Control>
              <Accordion.Panel>{faq.a()}</Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Container>
    </div>
  )
}
