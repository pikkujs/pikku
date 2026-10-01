import { Accordion, Container, Grid, Image, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './FaqWithImage.module.css'

// Decorative illustration — opaque sample URL kept inline.
const image =
  'https://raw.githubusercontent.com/mantinedev/ui.mantine.dev/master/lib/FaqWithImage/image.svg'

const faqs = [
  { value: 'reset-password', q: m.faqwithimage__q1, a: m.faqwithimage__a1 },
  { value: 'another-account', q: m.faqwithimage__q2, a: m.faqwithimage__a2 },
  { value: 'newsletter', q: m.faqwithimage__q3, a: m.faqwithimage__a3 },
  { value: 'credit-card', q: m.faqwithimage__q4, a: m.faqwithimage__a4 },
]

export function FaqWithImage() {
  return (
    <div className={classes.wrapper}>
      <Container size="lg">
        <Grid id="faq-grid" gap={50}>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Image src={image} alt={m.faqwithimage__image_alt()} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Title order={2} ta="left" className={classes.title}>
              {m.faqwithimage__title()}
            </Title>

            <Accordion chevronPosition="right" defaultValue="reset-password" variant="separated">
              {faqs.map((faq) => (
                <Accordion.Item className={classes.item} value={faq.value} key={faq.value}>
                  <Accordion.Control>{faq.q()}</Accordion.Control>
                  <Accordion.Panel>{faq.a()}</Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </Grid.Col>
        </Grid>
      </Container>
    </div>
  )
}
