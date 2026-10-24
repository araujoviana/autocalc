## Decisions

- Login runs on one background thread per process (non-daemon, so the CLI waits for it). A second
  call joins it. Its outcome is read through `auth_status`, which already checks the session live.
- Option names come from the builder's own `build()` parameters (recipe services: their control
  names), so a new builder needs no list to maintain.
