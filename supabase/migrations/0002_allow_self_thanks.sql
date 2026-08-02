-- Self-thanks are now gated by NEXT_PUBLIC_ALLOW_SELF_THANKS in the app rather
-- than by the database, so a single developer can exercise the flow end to end.
-- RLS still guarantees the sender is whoever is signed in.
alter table public.thanks drop constraint if exists thanks_no_self;
