# Scale

Fine on ten rows is not fine. Ask what happens at a hundred thousand.

- Is there a query in a loop?
- Does a list grow without limit? Does a report load everything into memory?
- Does a loop or span take its size from the caller? One request with a wide date range can exhaust memory.
- Does state live in one process? Does it survive another process, and do all its users land in the same deployed unit?
- Can saved input hurt later? A value stored by one request can hang an admin screen on every load.
