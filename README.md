# PigeonFeed

A peer-to-peer social feed in the browser: posts with pictures and video, likes and replies, friends, and private messages. There is no server of its own. It runs on the same stack as [PigeonChess](https://github.com/PeerPigeon/PigeonChess):

| Part | What it does here |
| --- | --- |
| [PeerPigeon](https://github.com/PeerPigeon/PeerPigeon) | The mesh between browsers, and its signed, synced storage |
| [freertc](https://github.com/draeder/freertc) | The relays that introduce browsers to each other (signaling only) |
| PigeonFS (PeerPigeon's storage servers) | Keeps the feed while nobody is online, and holds pictures and video |
| [PigeonIdP](https://github.com/PeerPigeon/PigeonIdP) | Accounts: one name on every device. The same accounts as PigeonChess |
| [unsea](https://github.com/draeder/unsea) | Keys, signatures and encryption (P-256 with ML-DSA-65 and ML-KEM-768) |

It looks like the rest of the family too: Vue 3, the Archivo typeface, and PigeonChess's stylesheet.

## Run it

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # the record and media rules
npm run typecheck
npm run build
npm run deploy     # builds, then uploads dist/ to Cloudflare (wrangler.jsonc)
```

By default a page joins the relay at `wss://peer.ooo/ws` and the room `pigeonfeed` / `global`.

## How it works

Nobody has to sign in. A browser has keys of its own, kept between visits, and what it writes is signed with them. Signing in to an account makes what a person writes theirs on every device.

Everything a person does is one signed record in the room's storage (`src/utils/records.ts`). Every peer in the room keeps these records, and so do the storage servers:

| Key | Record |
| --- | --- |
| `pf/p/<stamp>` | A post, or a reply to one |
| `pf/l/<signer>/<post>` | A like |
| `pf/u/<signer>` | A profile: a name, and the keys to write to that person privately |
| `pf/f/<signer>/<other>` | A friend request. A request each way makes two people friends |
| `pf/m/<a>~<b>/<stamp>` | A private message, encrypted to each of the two people |

A record counts only when the key that signed it is the one its key names, so nobody can like, befriend or describe themselves as someone else. A name shown without a key fragment is an account name, checked against the account's record.

Pictures and video are cut into 128 kB pieces and kept on the storage servers by their SHA-256 (`src/utils/media.ts`). Pictures are made smaller before posting (1600 px on the longest side); a video can be up to 50 MB.

## Layout

```
src/
  App.vue                    the top bar and the three pages
  components/                composer, post, media, friends, messages, account sheet
  composables/useMesh.ts     the PeerPigeon node, its storage and the storage servers
  composables/useIdentity.ts this browser's keys, and PigeonIdP accounts
  composables/useFeed.ts     every record, and the views of them the pages show
  utils/records.ts           what a record is and when it counts (tested)
  utils/media.ts             files in pieces on the storage servers (tested)
tests/                       node --test
```

## Known limits

- **Media and history need storage servers.** With none reachable, text posts still travel between the peers that are online, but pictures and video can't be posted.
- **Private messages hide what was said, not who said it.** That two people wrote to each other, and when, is visible to everyone in the room.
- **Deleting a post does not delete its media** from the storage servers.
- **Keys of records are predictable**, and the first writer of a key owns it. Someone could write another person's profile, like or friend key first: their record would not count, but the real owner could not then write there.
- **One room holds everything**, and every peer keeps all of it. That suits a small network, not a large one.
- **Nothing from the earlier React version (PigeonSocial) carries over**: its identities, posts and friends used a different network and format.
