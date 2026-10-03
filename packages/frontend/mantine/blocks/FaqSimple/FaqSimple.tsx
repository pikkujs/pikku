import { Accordion, Container, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './FaqSimple.module.css'

// Section copy is UI text (m.*) so it is translatable by default.
const faqs = [
  { value: 'reset-password', q: m.faqsimple__q1, a: m.faqsimple__a1 },
  { value: 'another-account', q: m.faqsimple__q2, a: m.faqsimple__a2 },
  { value: 'newsletter', q: m.faqsimple__q3, a: m.faqsimple__a3 },
  { value: 'credit-card', q: m.faqsimple__q4, a: m.faqsimple__a4 },
  { value: 'payment', q: m.faqsimple__q5, a: m.faqsimple__a5 },
]

export function FaqSimple() {
  return (
    <Container size="sm" className={classes.wrapper}>
      <Title ta="center" className={classes.title}>
        {m.faqsimple__title()}
      </Title>

      <Accordion variant="separated">
        {faqs.map((faq) => (
          <Accordion.Item className={classes.item} value={faq.value} key={faq.value}>
            <Accordion.Control>{faq.q()}</Accordion.Control>
            <Accordion.Panel>{faq.a()}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  )
}
