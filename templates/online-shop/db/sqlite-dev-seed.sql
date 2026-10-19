-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- A café supplier's catalogue, because that is what this template says it is in
-- three separate places: `home__title` ("Everything the café needs"), the
-- `shopper` persona ("Buys for a small café"), and the agent scenario's task
-- ("Find a coffee mug in the shop"). A seed of garden forks would leave the
-- copy telling one story and the data another.
--
-- The range is chosen to exercise the grid rather than to be long: names that
-- have to wrap, one sold-out item, two low on stock, and one withdrawn line. A
-- catalogue where everything is in stock never renders the other three cards.

INSERT INTO category (category_id, name, slug, description) VALUES
  ('cat_coffee',    'Coffee',     'coffee',     'Roasted to order, shipped within the week'),
  ('cat_equipment', 'Equipment',  'equipment',  'For behind the counter'),
  ('cat_tableware', 'Tableware',  'tableware',  'What it reaches the customer in')
ON CONFLICT DO NOTHING;

INSERT INTO item (item_id, category_id, name, slug, description, price_cents, stock, is_active) VALUES
  ('itm_house',    'cat_coffee',    'House espresso, 1kg',                   'house-espresso-1kg',   'Brazil and Guatemala. Chocolate and stewed fruit, forgiving if the grind drifts.', 2200, 48, 1),
  ('itm_single',   'cat_coffee',    'Single origin: Kenya Nyeri, 250g',      'kenya-nyeri-250g',     'Blackcurrant and a hard acidity. Filter, not espresso.',                          1150, 4,  1),
  ('itm_decaf',    'cat_coffee',    'Swiss water decaf, 1kg',                'swiss-water-decaf-1kg','Properly decaffeinated, so it still tastes of coffee.',                           2600, 0,  1),
  ('itm_tamper',   'cat_equipment', 'Tamper, 58.5mm flat base',              'tamper-58-5mm',        'Stainless base, walnut handle. Weighted so the pressure is yours to set.',        4800, 12, 1),
  ('itm_jug',      'cat_equipment', 'Milk jug, 600ml',                       'milk-jug-600ml',       'Sharp spout for latte art, rolled rim so it pours clean.',                       1900, 27, 1),
  ('itm_scale',    'cat_equipment', 'Brew scale with timer',                 'brew-scale-timer',     'Reads to 0.1g and does not switch itself off mid-pour.',                          5400, 3,  1),
  ('itm_mug',      'cat_tableware', 'Enamel coffee mug, 350ml',              'enamel-coffee-mug',    'Speckled enamel over steel. Survives being dropped on a flagstone floor.',       1400, 31, 1),
  ('itm_cup',      'cat_tableware', 'Cappuccino cup and saucer, six',        'cappuccino-cups-six',  'Thick-walled porcelain, so the drink is still warm at the table.',               3600, 0,  1),
  ('itm_oldgrind', 'cat_equipment', 'Hand grinder (withdrawn)',              'hand-grinder-withdrawn','No longer stocked — kept so past orders still read correctly.',                 3900, 0,  0)
ON CONFLICT DO NOTHING;

-- Reserved for the payment-webhook journey. The shop seeds no orders otherwise
-- — they are created by checking out — so the webhook had no deterministic row
-- to act on and the test could only assert that its URL existed.
INSERT INTO "order" (order_id, user_id, status, total_cents, shipping_address, created_at, updated_at) VALUES
  ('ord_probe', 'seed-user', 'pending', 4200, '{"line1":"12 Fenchurch Row","city":"London","postcode":"EC3M 5BN","country":"GB"}', datetime('now','-1 hour'), datetime('now','-1 hour'))
ON CONFLICT DO NOTHING;
