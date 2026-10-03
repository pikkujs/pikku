import { Container, Overlay, SimpleGrid, Text, Title, UnstyledButton } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { ContactIconsList } from './ContactIcons'
import classes from './FaqWithHeader.module.css'

// Labels are UI copy (m.*); image URLs are opaque samples kept inline.
const categories = [
  {
    label: m.faqwithheader__cat_support,
    image:
      'https://images.unsplash.com/photo-1508780709619-79562169bc64?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
  },
  {
    label: m.faqwithheader__cat_guides,
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&q=80',
  },
  {
    label: m.faqwithheader__cat_sales,
    image:
      'https://images.unsplash.com/photo-1543286386-713bdd548da4?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
  },
]

export function FaqWithHeader() {
  const items = categories.map((category, index) => (
    <UnstyledButton
      style={{ backgroundImage: `url(${category.image})` }}
      className={classes.categoryCard}
      key={index}
    >
      <Overlay color="#000" backgroundOpacity={0.6} zIndex={1} />
      <Text size="xl" ta="center" fw={700} className={classes.categoryLabel}>
        {category.label()}
      </Text>
    </UnstyledButton>
  ))

  return (
    <Container className={classes.wrapper} size="lg">
      <div className={classes.header}>
        <div>
          <Title className={classes.title}>{m.faqwithheader__title()}</Title>
          <Title className={classes.titleOverlay} role="presentation">
            {m.faqwithheader__faq()}
          </Title>
        </div>

        <div className={classes.contact}>
          <Text size="xl" fw={500} className={classes.contactTitle}>
            {m.faqwithheader__contact_us()}
          </Text>

          <ContactIconsList />
        </div>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>{items}</SimpleGrid>
    </Container>
  )
}
