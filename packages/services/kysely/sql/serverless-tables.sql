CREATE SCHEMA serverless;

CREATE TABLE serverless.lambda_channels (
    channel_id TEXT PRIMARY KEY,
    channel_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_data JSONB NOT NULL DEFAULT '{}',
    user_session JSONB,
    last_interaction TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE serverless.lambda_channel_subscriptions (
    channel_id TEXT NOT NULL REFERENCES serverless.lambda_channels(channel_id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    PRIMARY KEY (channel_id, topic)
);
