-- The cardinal correctness property: a unit cannot be double-booked.
--
-- Postgres itself rejects any INSERT/UPDATE that would create an overlapping
-- occupied range for the same unit. Two channels racing to book the same nights
-- will see the second write fail with a constraint violation — no application
-- lock, no read-modify-write race window.
--
-- We treat each stay as the half-open interval [check_in, check_out) so that a
-- same-day turnover (guest A checks out, guest B checks in) does NOT count as an
-- overlap.
ALTER TABLE availability_blocks
  DROP CONSTRAINT IF EXISTS availability_no_overlap;

ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    tstzrange(check_in, check_out, '[)') WITH &&
  );
