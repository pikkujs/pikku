# Realtime

Read `pikku-realtime` first. Realtime bugs hide because the happy path looks perfect.

- Does unsubscribing actually stop messages?
- Is the channel authenticated, and is a private message sent only to its owner?
- Does a reconnecting client recover its state?
- What happens with a slow client, and with two server instances?
