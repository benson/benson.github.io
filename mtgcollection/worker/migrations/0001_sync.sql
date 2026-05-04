create table if not exists sync_collections (
  id text primary key,
  user_id text not null unique,
  revision integer not null default 0,
  snapshot_json text not null,
  created_at integer not null,
  updated_at integer not null
);

create table if not exists sync_ops (
  id text primary key,
  collection_id text not null,
  user_id text not null,
  client_id text not null,
  op_id text not null,
  revision integer not null,
  op_json text not null,
  created_at integer not null,
  unique(collection_id, client_id, op_id)
);

create index if not exists sync_ops_collection_revision_idx
  on sync_ops (collection_id, revision);

create table if not exists sync_devices (
  id text primary key,
  user_id text not null,
  client_id text not null,
  label text,
  last_seen_at integer not null
);

create table if not exists sync_shares (
  share_id text primary key,
  user_id text not null,
  collection_id text,
  container_key text,
  kind text not null default 'deck',
  created_at integer not null,
  updated_at integer not null
);

create index if not exists sync_shares_user_idx
  on sync_shares (user_id);
