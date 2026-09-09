import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { CARRY_MAX, MAX_LEVEL, ROAST_TOTAL, nextLevelAt } from './config'
import { CampfireState, local, now, topCampers } from './state'
import { stateEntity, identity } from './sync'
import { addWoodAction, sitByFire } from './campfire'
import { gatherAction } from './wood'
import { cheers, finishRoast, inviteEveryone, startRoast, warmUp } from './social'
import { REACTIONS, sendReaction } from './reactions'

const PANEL = Color4.create(0.05, 0.04, 0.03, 0.72)
const PANEL_SOFT = Color4.create(0.05, 0.04, 0.03, 0.55)
const CREAM = Color4.create(1, 0.96, 0.9, 1)
const AMBER = Color4.create(1, 0.78, 0.35, 1)
const DIM = Color4.create(0.85, 0.82, 0.78, 1)

function barColor(pct: number): Color4 {
  if (pct > 50) return Color4.create(0.45, 0.8, 0.35, 1)
  if (pct > 25) return Color4.create(1, 0.7, 0.25, 1)
  return Color4.create(0.95, 0.35, 0.28, 1)
}

function FireStatus() {
  const s = CampfireState.getOrNull(stateEntity)
  const fuel = s ? Math.max(0, s.fuel) : 0
  const pct = Math.round(fuel)
  const level = s?.level ?? 1
  const total = s?.totalLogs ?? 0
  const next = nextLevelAt(level)
  const low = pct < 25
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 140)

  return (
    <UiEntity
      uiTransform={{
        width: 280,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 10,
        margin: { top: 4 }
      }}
      uiBackground={{ color: PANEL }}
    >
      <Label
        value={`${low ? '⚠️' : '🔥'}  CAMPFIRE  ·  LEVEL ${level}${level >= MAX_LEVEL ? '  ★' : ''}`}
        fontSize={15}
        color={low ? Color4.create(1, 0.5, 0.4, 1) : AMBER}
      />
      <UiEntity uiTransform={{ width: 250, height: 16, margin: { top: 6 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.15) }}>
        <UiEntity
          uiTransform={{ width: `${pct}%`, height: '100%' }}
          uiBackground={{ color: low ? Color4.create(0.95, 0.35, 0.28, pulse) : barColor(pct) }}
        />
      </UiEntity>
      <Label
        value={
          next === null
            ? `${pct}%  ·  ${total} logs burned  ·  MAX LEVEL`
            : `${pct}%  ·  ${total} logs  ·  next level at ${next}`
        }
        fontSize={12}
        color={DIM}
      />
    </UiEntity>
  )
}

function Leaderboard() {
  const top = topCampers(3)
  const me = identity().name
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 10, top: 10 },
        width: 150,
        flexDirection: 'column',
        padding: 8
      }}
      uiBackground={{ color: PANEL_SOFT }}
    >
      <Label value="AROUND THE FIRE 🪵" fontSize={11} color={AMBER} />
      {top.length === 0 ? (
        <Label value="be the first to feed it" fontSize={11} color={DIM} />
      ) : (
        top.map((r, i) => (
          <Label
            key={i}
            value={`${i + 1}. ${r.name.slice(0, 12)}  ${r.logs}`}
            fontSize={12}
            color={r.name === me ? CREAM : DIM}
          />
        ))
      )}
      <Label value={`you: ${local.contributed} logs`} fontSize={11} color={AMBER} />
    </UiEntity>
  )
}

function Toast() {
  if (now() >= local.toast.until || !local.toast.text) return null
  return (
    <UiEntity
      uiTransform={{ width: 320, height: 40, justifyContent: 'center', alignItems: 'center', margin: { bottom: 6 } }}
      uiBackground={{ color: Color4.create(0.05, 0.04, 0.03, 0.85) }}
    >
      <Label value={local.toast.text} fontSize={15} color={CREAM} />
    </UiEntity>
  )
}

function RoastBar() {
  if (!local.roast.active) return null
  const frac = Math.min(1, local.roast.t / ROAST_TOTAL)
  // white -> golden -> brown -> black
  const col =
    frac < 0.5
      ? Color4.create(1, 0.95, 0.8, 1)
      : frac < 0.72
      ? Color4.create(1, 0.75, 0.35, 1)
      : frac < 0.87
      ? Color4.create(0.7, 0.4, 0.15, 1)
      : Color4.create(0.2, 0.15, 0.1, 1)
  return (
    <UiEntity
      uiTransform={{ width: 300, flexDirection: 'column', alignItems: 'center', padding: 8, margin: { bottom: 6 } }}
      uiBackground={{ color: PANEL }}
    >
      <Label value="🍡 roasting — take it out when golden!" fontSize={13} color={CREAM} />
      <UiEntity uiTransform={{ width: 260, height: 14, margin: { top: 5 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.15) }}>
        <UiEntity uiTransform={{ width: `${frac * 100}%`, height: '100%' }} uiBackground={{ color: col }} />
      </UiEntity>
    </UiEntity>
  )
}

function primaryButton() {
  if (local.roast.active) {
    return { label: '🍡  TAKE IT OUT', action: finishRoast, on: true }
  }
  if (local.nearFire && local.carrying > 0) {
    return { label: `🔥  ADD WOOD  (${local.carrying})`, action: addWoodAction, on: true }
  }
  if (local.nearWood && local.woodPileReady) {
    return { label: '🪵  GATHER WOOD', action: gatherAction, on: true }
  }
  if (local.nearWood && !local.woodPileReady) {
    return { label: '⏳  pile restocking…', action: () => {}, on: false }
  }
  if (local.carrying > 0) {
    return { label: '➡️  carry the wood to the fire', action: () => {}, on: false }
  }
  return { label: '🔎  find a wood pile to gather', action: () => {}, on: false }
}

function BottomArea() {
  const pb = primaryButton()
  const showSocial = local.nearFire && !local.roast.active
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
      <Toast />
      <RoastBar />

      {showSocial && (
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: 6 } }}>
          <Button value="🍡 Roast" fontSize={13} uiTransform={{ width: 88, height: 40, margin: { right: 4 } }} uiBackground={{ color: PANEL }} color={CREAM} onMouseDown={startRoast} />
          <Button value="🥂 Cheers" fontSize={13} uiTransform={{ width: 92, height: 40, margin: { right: 4 } }} uiBackground={{ color: PANEL }} color={CREAM} onMouseDown={cheers} />
          <Button value="👐 Warm" fontSize={13} uiTransform={{ width: 84, height: 40, margin: { right: 4 } }} uiBackground={{ color: PANEL }} color={CREAM} onMouseDown={warmUp} />
          <Button value="🪵 Sit" fontSize={13} uiTransform={{ width: 72, height: 40 }} uiBackground={{ color: PANEL }} color={CREAM} onMouseDown={sitByFire} />
        </UiEntity>
      )}

      <Button
        value={pb.label}
        fontSize={18}
        variant="primary"
        uiTransform={{ width: 300, height: 56 }}
        uiBackground={{ color: pb.on ? Color4.create(0.8, 0.35, 0.12, 1) : Color4.create(0.3, 0.28, 0.26, 0.9) }}
        color={CREAM}
        onMouseDown={pb.action}
      />

      <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: 4 } }}>
        {REACTIONS.map((emoji, i) => (
          <Button
            key={i}
            value={emoji}
            fontSize={18}
            uiTransform={{ width: 46, height: 38, margin: { right: 4 } }}
            uiBackground={{ color: PANEL }}
            color={CREAM}
            onMouseDown={() => sendReaction(emoji)}
          />
        ))}
      </UiEntity>

      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: 2, bottom: 4 } }}>
        <UiEntity uiTransform={{ padding: { left: 8, right: 8, top: 4, bottom: 4 } }} uiBackground={{ color: PANEL_SOFT }}>
          <Label value={`🎒 ${local.carrying}/${CARRY_MAX}`} fontSize={13} color={local.carrying >= CARRY_MAX ? AMBER : CREAM} />
        </UiEntity>
        {local.cozy && (
          <UiEntity uiTransform={{ padding: { left: 8, right: 8, top: 4, bottom: 4 }, margin: { left: 6 } }} uiBackground={{ color: Color4.create(0.8, 0.35, 0.12, 0.85) }}>
            <Label value="🔥 cozy" fontSize={13} color={CREAM} />
          </UiEntity>
        )}
        <Button value="🙋 Invite everyone" fontSize={13} uiTransform={{ width: 150, height: 30, margin: { left: 6 } }} uiBackground={{ color: PANEL }} color={CREAM} onMouseDown={inviteEveryone} />
      </UiEntity>
    </UiEntity>
  )
}

function LevelBanner() {
  if (now() >= local.levelBanner.until) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '32%', left: 0 },
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity uiTransform={{ padding: { left: 24, right: 24, top: 12, bottom: 12 } }} uiBackground={{ color: Color4.create(0.8, 0.35, 0.12, 0.92) }}>
        <Label value={`🔥  LEVEL ${local.levelBanner.level}!`} fontSize={30} color={CREAM} />
      </UiEntity>
    </UiEntity>
  )
}

function Welcome() {
  if (!local.showWelcome) return null
  if (local.welcomeUntil === 0) local.welcomeUntil = now() + 40
  if (now() > local.welcomeUntil) {
    local.showWelcome = false
    return null
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <UiEntity uiTransform={{ width: 340, flexDirection: 'column', alignItems: 'center', padding: 20 }} uiBackground={{ color: Color4.create(0.08, 0.06, 0.05, 0.96) }}>
        <Label value="⛺  FRIENDZONE CAMPFIRE" fontSize={20} color={AMBER} />
        <Label value="The fire is always dying. Keep it alive together." fontSize={14} color={CREAM} uiTransform={{ margin: { top: 8 } }} />
        <Label value="🪵 Tap a wood pile to gather logs" fontSize={13} color={DIM} uiTransform={{ margin: { top: 10 } }} />
        <Label value="🔥 Bring them to the fire, tap ADD WOOD" fontSize={13} color={DIM} uiTransform={{ margin: { top: 2 } }} />
        <Label value="⭐ Feed it together to level up the camp" fontSize={13} color={DIM} uiTransform={{ margin: { top: 2 } }} />
        <Label value="🍡 Roast marshmallows · 🙋 invite friends" fontSize={13} color={DIM} uiTransform={{ margin: { top: 2 } }} />
        <Button
          value="LET'S GO"
          fontSize={18}
          variant="primary"
          uiTransform={{ width: 200, height: 50, margin: { top: 16 } }}
          uiBackground={{ color: Color4.create(0.8, 0.35, 0.12, 1) }}
          color={CREAM}
          onMouseDown={() => (local.showWelcome = false)}
        />
      </UiEntity>
    </UiEntity>
  )
}

function Hud() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12
      }}
    >
      <FireStatus />
      <Leaderboard />
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <BottomArea />
      <LevelBanner />
      <Welcome />
    </UiEntity>
  )
}

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(Hud)
}
