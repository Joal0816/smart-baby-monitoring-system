# Caregiver App Visual Direction

## Surface

Caregiver monitoring dashboard and history/settings flow. The browser preview is a convenience for following UI work in VS Code; the Android app remains the submission interface.

## Direction

The Android app remains native Material 3. The VS Code browser preview uses **Electric Night-light**: an inky indigo ground, violet navigation, and bright aqua, coral, sunshine, and mint colors assigned consistently to readings. Use a rounded sans-serif hierarchy, high contrast, and flat color surfaces rather than warm paper, sage panels, and serif headings.

The signature move is the luminous reading trace: each sensor keeps its own color across the room marker, gauge, and trend chart, with a restrained glow around the active measurement. The room illustration uses the same deep violet night palette with a warm lamp as its focal point. Keep the standard navigation and controls recognizable, and preserve explicit text labels beside status colors.

## Hierarchy

1. Monitoring/cry state and last-update time.
2. Temperature, humidity, light, proximity/placement, and device health.
3. Recent events and acknowledgement.
4. Settings and historical search.

## Motion

Use slow, subtle idle motion for the room and brief state transitions. Never flash or bounce alert content. Honor reduced-motion preferences and keep content visible if animation is disabled.

## Accessibility

Use Material 3 color roles and system typography in Android; maintain strong contrast in both surfaces; include text and icon with every status color; support large font scale, TalkBack, keyboard focus in the preview, and 48 dp native targets.
