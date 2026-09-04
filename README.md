# ⛺ Friendzone Campfire

A cozy **co-op hangout** for Decentraland, built mobile-first for the
[Friendzone Mobile Buildathon](https://dorahacks.io/).

> The fire is always dying. You can't keep it alive alone.
> Gather wood, feed the flames together, roast marshmallows, and level up the
> camp with everyone who shows up.

**Play it:** [`softalpha.dcl.eth`](https://decentraland.org/jump?realm=softalpha.dcl.eth)

---

## The idea

Decentraland is "where you hang out online" — and its own tagline mentions
*campfire hangouts*. This scene makes that literal: a single shared fire at the
centre of a small clearing that **constantly burns down**. Every player who
walks in becomes part of keeping it going.

It's designed so that:

- **You need other people.** One player can *just barely* keep the fire alive by
  sprinting between wood piles. Two or three players turn it into a relaxed,
  chatty rhythm. The fire visibly grows with the group.
- **There's a shared, persistent-feeling goal.** Every log everyone contributes
  counts toward a **community campfire level** (1–10). Lanterns light up around
  the camp as the level climbs. The "Camp Log" board shows how far the group
  has pushed it.
- **There's always something to do while talking.** Roast a marshmallow (timing
  mini-game), raise a toast, warm your hands, call everyone back to the fire,
  pull up a log seat.
- **It rewards coming back.** The camp level, the leaderboard of who's fed the
  fire most, and the "saved from going out" counter all give regulars something
  to build on and newcomers something to jump into.

---

## How to play

| Action | Mobile | Desktop |
| --- | --- | --- |
| Gather wood | Walk to a wood pile → tap **🪵 GATHER WOOD** (or tap the pile) | same, or click the pile |
| Feed the fire | Walk to the fire → tap **🔥 ADD WOOD** (or tap the fire) | same |
| Roast a marshmallow | Near the fire → **🍡 Roast**, then **TAKE IT OUT** when golden | same |
| Toast / warm up / sit | Near the fire → the small button row | same |
| Invite everyone | **🙋 Invite everyone** — pings every player in the World | same |

The big context button at the bottom always shows the one thing that makes
sense to do right now, so there's nothing to memorise.

---

## Mobile-first design notes

- **No precise aiming required.** Every interaction has a large on-screen button
  driven by *proximity*, not raycasting. Tapping the 3D object also works, but
  you never have to.
- **One primary action at a time.** The bottom button is context-aware
  (gather → carry → feed → take-it-out). Secondary social actions only appear
  when you're at the fire.
- **Big touch targets & readable text.** Primary button is 56px tall; body text
  is 12–18px with outlines for contrast against the night scene.
- **Fast load, smooth frame rate.** The entire scene is built from SDK7
  primitives — no downloaded 3D models or textures. Per-frame component writes
  are guarded so idle state costs almost nothing.
- **One-screen onboarding.** A single dismissible card explains the loop in four
  lines; it also auto-dismisses.

---

## Multiplayer / social systems

| System | How it works |
| --- | --- |
| **Shared fire state** | A single networked entity (`CampfireState`) holds `fuel`, `totalLogs`, `level`, `savedCount`. Replicated to every player with `syncEntity` from `@dcl/sdk/network`, so late joiners see the real fire. |
| **Decay without a server** | Any client applies decay once per second, gated by a shared timestamp on the synced component. A self-correcting clock offset keeps late joiners and reconnects in step — no elected authority, no backend required. |
| **Social events** | Ephemeral messages (`feed`, `chop`, `invite`, `cheers`, `roast`, roster sync) over `MessageBus` drive toasts, other players' chop particles, the "whoosh" when someone feeds the fire, and the leaderboard. |
| **Leaderboard** | Rebuilt on each client from `feed` / `roster` messages; shows the top campers by logs contributed this session. |
| **Level-up moment** | When the community crosses a level threshold, every player gets the same toast and the flame + lanterns react. |

> **Known limitation:** totals live for as long as the World has players in it
> (no database). Dropping in a real backend (e.g. the Decentraland multiplayer
> server) for cross-session persistence is the natural next step and the state
> model is already shaped for it.

---

## License

Open source under the MIT License — see [`LICENSE`](LICENSE). Built with the
Decentraland SDK7.
