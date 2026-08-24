-- Phase 1B: baseline schema (the tables every other migration assumes).
--
-- WHY THIS EXISTS: none of the other migrations in this directory create
-- any tables - they all begin with `alter table profiles ...`,
-- `create policy ... on orders`, etc. The production tables were created
-- outside this repo's migration history (dashboard UI or an uncommitted
-- script), which meant the repo could not stand up its own database from
-- scratch: applying the migration set to a fresh project failed
-- immediately with `relation "profiles" does not exist`. That was
-- discovered on 2026-08-25 when pointing a brand-new staging project at
-- these migrations. This file closes that gap.
--
-- Its timestamp is deliberately EARLIER than every other migration so it
-- runs first.
--
-- FIDELITY: reconstructed to match the live production schema exactly, as
-- captured from information_schema.columns + pg_constraint on 2026-08-24
-- (column names, types, nullability, defaults, and the original
-- constraint names - note profiles' constraints are named `users_*`,
-- preserved as-is because production has them that way, presumably from
-- an earlier table rename).
--
-- SAFE ON PRODUCTION: every statement is `if not exists` / guarded, so
-- running this against production is a complete no-op. It does not drop,
-- alter, or touch a single existing object or row.
--
-- NOT INCLUDED: production also has a `restaurants` table (only its
-- primary key was visible in the constraint dump; its columns were never
-- captured, and no application code references it - the restaurant list
-- in PostRequest.tsx is hardcoded client-side). It is deliberately
-- omitted rather than guessed at. If it turns out to matter, it needs its
-- own migration written from a real schema dump.
--
-- STATUS: prepared in the repo, NOT applied to any project.

create table if not exists profiles (
  id uuid not null default gen_random_uuid(),
  name varchar not null,
  email varchar not null,
  phone varchar,
  hostel_block varchar,
  hostel_type varchar,
  rating numeric default 0.0,
  successful_deliveries integer default 0,
  balance numeric default 0.0,
  created_at timestamptz default now(),
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_hostel_type_check check (hostel_type in ('mens', 'ladies', 'campus'))
);

create table if not exists orders (
  id uuid not null default gen_random_uuid(),
  requester_id uuid,
  deliverer_id uuid,
  restaurant_name varchar not null,
  items jsonb not null,
  tip_amount numeric default 0.0,
  delivery_location jsonb not null,
  status varchar default 'pending',
  otp varchar,
  distance_km numeric,
  created_at timestamptz default now(),
  constraint orders_pkey primary key (id),
  constraint orders_requester_id_fkey foreign key (requester_id) references profiles(id),
  constraint orders_deliverer_id_fkey foreign key (deliverer_id) references profiles(id)
);

create table if not exists chat_messages (
  id uuid not null default gen_random_uuid(),
  order_id uuid,
  sender_id uuid,
  message text not null,
  created_at timestamptz default now(),
  constraint chat_messages_pkey primary key (id),
  constraint chat_messages_order_id_fkey foreign key (order_id) references orders(id),
  constraint chat_messages_sender_id_fkey foreign key (sender_id) references profiles(id)
);

create table if not exists friendships (
  id uuid not null default gen_random_uuid(),
  requester_id uuid,
  addressee_id uuid,
  status varchar default 'pending',
  created_at timestamptz default now(),
  constraint friendships_pkey primary key (id),
  constraint friendships_requester_id_fkey foreign key (requester_id) references profiles(id),
  constraint friendships_addressee_id_fkey foreign key (addressee_id) references profiles(id)
);
