# Research behind Fold

The web system uses compact spacing, a trailing Inset key for primary actions and a citron selection in navigation. The catalog and implementation rules live in the [Fold design contract](../../DESIGN.md).

## What the research changed

Independent web and mobile investigations examined first-party product accounts and platform guidance. They support specific design decisions. They provide no comparative performance data for Kairn users.

| Reference | Observation | Decision for Fold |
| --- | --- | --- |
| [Linear’s interface refresh](https://linear.app/now/behind-the-latest-design-refresh) | Linear made its inactive sidebar quieter, compacted tabs, and gave location and view controls predictable positions. It also increased spacing where adjacent sidebar items needed separation. | Use a restrained rail and keep the selected destination visible. Concentrate colour in the actual specimen. Tighten related controls while retaining separation between groups. |
| [IBM Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview) | Small spacing increments serve relationships inside components. Larger increments establish grouping. | Start at 4 for label-to-value, 8 for related actions, 12 for adjacent specimens, 16 for group insets and 24 for separate tasks. |
| [GitHub Primer buttons](https://primer.style/product/components/button/) | A group reserves its highest visual priority for a single action. | Give the committing action the inset key. Reset and Cancel use a quiet outline. Failure keeps a visible textual recovery path. |
| [Things’ interaction design](https://culturedcode.com/things/features/) | The Plus control supports ordinary creation by tap and deliberate placement by drag. An additional interaction earns its complexity by changing the result. | Begin with familiar click and tap semantics. A visible press and local receipt make the result legible. Introduce gesture accelerators only when they remove a real step. |
| [Slack mobile navigation](https://slack.com/help/articles/29788684062739-Customize-the-Slack-mobile-app/) and [Android adaptive layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) | Slack exposes desktop sidebar conversations in mobile Home. Android describes a bottom bar for a few peer destinations and a rail at larger widths. | Share destination names, order and selection across placements. The Navigation specimen lets you test the same selection in a dock and a rail. The longer atlas index becomes a searchable list on narrow screens. |
| [Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) and [Android touch targets](https://developer.android.com/guide/topics/ui/accessibility/apps) | Press feedback communicates recognition. Platform guidance distinguishes visible artwork from its tappable area. | Use a compact visible button within a 48 CSS px coarse-pointer target in the web specimen. At native implementation, preserve 44 pt on iOS and 48 dp on Android, plus the larger primary field-capture target. |
| [Apple Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) and [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Surface hierarchy and legibility need separate treatment in each appearance. | Give the canvas, raised surface, secondary text, focus ring, error and success independent roles. Pair colour with labels or symbols. Keep focus visible and disable movement with reduced motion. |

## Adoption

The web implementation and review procedure now live in the [Fold design contract](../../DESIGN.md). Compare the same populated journey picker on web and native during the mobile pilot. Measure visible rows, time to open a specified journey, mistaken selections and recognition of the active destination.
