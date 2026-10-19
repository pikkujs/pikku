-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- Three floors of a small hotel, with every housekeeping state represented.
-- The front desk groups by floor and colours by state, so a seed where every
-- room is clean would render one flat colour and prove nothing about whether
-- the page helps somebody find the room that needs attention.

INSERT INTO room_type (room_type_id, name, slug, description, capacity, base_rate_cents) VALUES
  ('rt_single', 'Single',        'single',        'One bed, one window, quiet side',       1, 9500),
  ('rt_double', 'Double',        'double',        'Queen bed, desk, bath',                 2, 14500),
  ('rt_twin',   'Twin',          'twin',          'Two singles, for colleagues or friends',2, 15000),
  ('rt_suite',  'Garden suite',  'garden-suite',  'Sitting room and its own terrace',      4, 26000)
ON CONFLICT DO NOTHING;

INSERT INTO room (room_id, room_type_id, number, floor, housekeeping_status, notes) VALUES
  ('rm_101', 'rt_single', '101', 1, 'clean',          NULL),
  ('rm_102', 'rt_double', '102', 1, 'dirty',          'Late checkout, guest left at 11:40'),
  ('rm_103', 'rt_double', '103', 1, 'inspected',      NULL),
  ('rm_104', 'rt_twin',   '104', 1, 'clean',          NULL),
  ('rm_105', 'rt_single', '105', 1, 'out_of_service', 'Radiator leaking — plumber booked Thursday'),
  ('rm_201', 'rt_double', '201', 2, 'clean',          NULL),
  ('rm_202', 'rt_double', '202', 2, 'dirty',          NULL),
  ('rm_203', 'rt_twin',   '203', 2, 'clean',          NULL),
  ('rm_204', 'rt_single', '204', 2, 'inspected',      NULL),
  ('rm_205', 'rt_double', '205', 2, 'dirty',          'Stayover — towels only'),
  ('rm_301', 'rt_suite',  '301', 3, 'clean',          NULL),
  ('rm_302', 'rt_suite',  '302', 3, 'dirty',          'Deep clean before the weekend arrival')
ON CONFLICT DO NOTHING;

INSERT INTO guest (guest_id, full_name, email, phone) VALUES
  ('gst_moretti', 'Elena Moretti',  'elena.moretti@example.com', '+44 7700 900112'),
  ('gst_okafor',  'Chidi Okafor',   'c.okafor@example.com',      '+44 7700 900335'),
  ('gst_lindqvist','Anja Lindqvist','anja.l@example.com',        NULL),
  ('gst_bakker',  'Tom Bakker',     't.bakker@example.com',      '+31 6 1234 5678')
ON CONFLICT DO NOTHING;

INSERT INTO booking (booking_id, guest_id, room_type_id, room_id, arrival, departure, guests, status, total_cents, source) VALUES
  ('bk_1', 'gst_moretti',   'rt_double', 'rm_103', date('now'),          date('now','+2 days'), 2, 'checked_in',  29000, 'direct'),
  ('bk_2', 'gst_okafor',    'rt_suite',  'rm_301', date('now'),          date('now','+3 days'), 3, 'checked_in',  78000, 'direct'),
  -- Arriving today and not yet in a room: the desk needs somebody to check in,
  -- or the arrivals board is a screen that can never be used.
  ('bk_3', 'gst_lindqvist', 'rt_twin',   NULL,     date('now'),          date('now','+3 days'), 2, 'confirmed',   45000, 'ota'),
  ('bk_4', 'gst_bakker',    'rt_single', NULL,     date('now','+5 days'),date('now','+6 days'), 1, 'held',         9500, 'direct'),
  -- Reserved for the coverage scenario's MCP check-in. The arrivals board shows
  -- bk_3 and the browser journey checks it in; sharing one booking makes the two
  -- runs fight over the same room.
  ('bk_probe', 'gst_bakker', 'rt_twin', NULL, date('now'), date('now','+1 days'), 1, 'confirmed', 12000, 'direct'),
  ('bk_5', 'gst_moretti',   'rt_double', NULL,     date('now','-9 days'),date('now','-7 days'), 2, 'checked_out', 29000, 'direct')
ON CONFLICT DO NOTHING;

INSERT INTO housekeeping_task (task_id, room_id, kind, status, assigned_to, notes) VALUES
  ('hk_1', 'rm_102', 'turnover',    'open',        NULL, NULL),
  ('hk_2', 'rm_202', 'turnover',    'in_progress', NULL, NULL),
  ('hk_3', 'rm_205', 'stayover',    'open',        NULL, 'Towels only'),
  ('hk_4', 'rm_302', 'deep_clean',  'open',        NULL, 'Before Friday'),
  ('hk_5', 'rm_105', 'maintenance', 'open',        NULL, 'Radiator')
ON CONFLICT DO NOTHING;
