// Generated from packages/design-tokens/tokens. Edit the DTCG source.
package dev.kairn.tokens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

// Text dimensions use sp and layout dimensions use dp. Font families are ordered fallback names.
// Use semanticMotionInstant for reduced motion.
public enum class KairnTokens {
    Light, Dark, Outdoor;

    public val componentCaptureButtonBackground: Color
        get() = when (this) {
            Light -> Color(0xFF174940)
            Dark -> Color(0xFF9CD5BD)
            Outdoor -> Color(0xFF0D382D)
        }

    public val componentCaptureButtonForeground: Color
        get() = when (this) {
            Light -> Color(0xFFFFFFFF)
            Dark -> Color(0xFF112B24)
            Outdoor -> Color(0xFFFFFFFF)
        }

    public val componentCaptureButtonMinHeight: Dp get() = 56f.dp

    public val componentCaptureButtonRadius: Dp get() = 8f.dp

    public val componentChapterHeadingFamily: List<String> get() = listOf("Georgia", "serif")

    public val componentChapterHeadingFontSize: TextUnit get() = 36f.sp

    public val componentChapterHeadingLineHeight: TextUnit get() = 42f.sp

    public val componentMomentCardBackground: Color
        get() = when (this) {
            Light -> Color(0xFFFFFFFF)
            Dark -> Color(0xFF1C2B29)
            Outdoor -> Color(0xFFFFFFFF)
        }

    public val componentMomentCardBorderWidth: Dp
        get() = when (this) {
            Light -> 1f.dp
            Dark -> 1f.dp
            Outdoor -> 2f.dp
        }

    public val componentMomentCardPadding: Dp get() = 16f.dp

    public val componentMomentCardRadius: Dp get() = 12f.dp

    public val componentRouteLineCasing: Dp get() = 2f.dp

    public val componentRouteLineDash: Dp get() = 6f.dp

    public val componentRouteLineEstimated: Color
        get() = when (this) {
            Light -> Color(0xFF285AA4)
            Dark -> Color(0xFFA9C8FF)
            Outdoor -> Color(0xFF123E81)
        }

    public val componentRouteLineEstimatedWidth: Dp get() = 3f.dp

    public val componentRouteLineGap: Dp get() = 4f.dp

    public val componentRouteLineRecorded: Color
        get() = when (this) {
            Light -> Color(0xFF174940)
            Dark -> Color(0xFF9CD5BD)
            Outdoor -> Color(0xFF0D382D)
        }

    public val componentRouteLineRecordedWidth: Dp get() = 4f.dp

    public val componentSyncStatusFailed: Color
        get() = when (this) {
            Light -> Color(0xFF9D2C2D)
            Dark -> Color(0xFFFFABAC)
            Outdoor -> Color(0xFF761D23)
        }

    public val componentSyncStatusUploaded: Color
        get() = when (this) {
            Light -> Color(0xFF21633F)
            Dark -> Color(0xFF93D8AC)
            Outdoor -> Color(0xFF134729)
        }

    public val componentSyncStatusWaiting: Color
        get() = when (this) {
            Light -> Color(0xFF80530B)
            Dark -> Color(0xFFF2C36F)
            Outdoor -> Color(0xFF583900)
        }

    public val semanticActivityCycling: Color
        get() = when (this) {
            Light -> Color(0xFF824820)
            Dark -> Color(0xFFF3BA88)
            Outdoor -> Color(0xFF603916)
        }

    public val semanticActivityOther: Color
        get() = when (this) {
            Light -> Color(0xFF49635F)
            Dark -> Color(0xFFB5C8BF)
            Outdoor -> Color(0xFF293B34)
        }

    public val semanticActivityRoadTrip: Color
        get() = when (this) {
            Light -> Color(0xFF285AA4)
            Dark -> Color(0xFFA9C8FF)
            Outdoor -> Color(0xFF123E81)
        }

    public val semanticActivityTrek: Color
        get() = when (this) {
            Light -> Color(0xFF174940)
            Dark -> Color(0xFF9CD5BD)
            Outdoor -> Color(0xFF0D382D)
        }

    public val semanticBorderControl: Dp
        get() = when (this) {
            Light -> 1f.dp
            Dark -> 1f.dp
            Outdoor -> 2f.dp
        }

    public val semanticColorAction: Color
        get() = when (this) {
            Light -> Color(0xFF174940)
            Dark -> Color(0xFF9CD5BD)
            Outdoor -> Color(0xFF0D382D)
        }

    public val semanticColorActionWash: Color
        get() = when (this) {
            Light -> Color(0xFFE1EFEA)
            Dark -> Color(0xFF28453C)
            Outdoor -> Color(0xFFE9F2EB)
        }

    public val semanticColorBoundary: Color
        get() = when (this) {
            Light -> Color(0xFF78857E)
            Dark -> Color(0xFF8A9E95)
            Outdoor -> Color(0xFF31463D)
        }

    public val semanticColorCanvas: Color
        get() = when (this) {
            Light -> Color(0xFFF6F3EB)
            Dark -> Color(0xFF111C1B)
            Outdoor -> Color(0xFFFFFFFF)
        }

    public val semanticColorError: Color
        get() = when (this) {
            Light -> Color(0xFF9D2C2D)
            Dark -> Color(0xFFFFABAC)
            Outdoor -> Color(0xFF761D23)
        }

    public val semanticColorInformation: Color
        get() = when (this) {
            Light -> Color(0xFF285AA4)
            Dark -> Color(0xFFA9C8FF)
            Outdoor -> Color(0xFF123E81)
        }

    public val semanticColorInk: Color
        get() = when (this) {
            Light -> Color(0xFF172C2B)
            Dark -> Color(0xFFF1F4EE)
            Outdoor -> Color(0xFF101815)
        }

    public val semanticColorOnAction: Color
        get() = when (this) {
            Light -> Color(0xFFFFFFFF)
            Dark -> Color(0xFF112B24)
            Outdoor -> Color(0xFFFFFFFF)
        }

    public val semanticColorSecondaryText: Color
        get() = when (this) {
            Light -> Color(0xFF49635F)
            Dark -> Color(0xFFB5C8BF)
            Outdoor -> Color(0xFF293B34)
        }

    public val semanticColorStoryAccent: Color
        get() = when (this) {
            Light -> Color(0xFF824820)
            Dark -> Color(0xFFF3BA88)
            Outdoor -> Color(0xFF603916)
        }

    public val semanticColorSuccess: Color
        get() = when (this) {
            Light -> Color(0xFF21633F)
            Dark -> Color(0xFF93D8AC)
            Outdoor -> Color(0xFF134729)
        }

    public val semanticColorSurface: Color
        get() = when (this) {
            Light -> Color(0xFFFFFFFF)
            Dark -> Color(0xFF1C2B29)
            Outdoor -> Color(0xFFFFFFFF)
        }

    public val semanticColorWarning: Color
        get() = when (this) {
            Light -> Color(0xFF80530B)
            Dark -> Color(0xFFF2C36F)
            Outdoor -> Color(0xFF583900)
        }

    public val semanticEasingSelection: CubicBezierEasing get() = CubicBezierEasing(0f, 0f, 0.58f, 1f)

    public val semanticElevationBlur: Dp get() = 16f.dp

    public val semanticElevationOffsetX: Dp get() = 0f.dp

    public val semanticElevationOffsetY: Dp get() = 4f.dp

    public val semanticElevationOpacity: Double get() = 0.14

    public val semanticFontFamilyStory: List<String> get() = listOf("Georgia", "serif")

    public val semanticFontFamilyUi: List<String> get() = listOf("Source Sans 3", "system-ui", "sans-serif")

    public val semanticFontSizeBody: TextUnit get() = 16f.sp

    public val semanticFontSizeCaption: TextUnit get() = 14f.sp

    public val semanticFontSizeChapter: TextUnit get() = 36f.sp

    public val semanticFontSizeSection: TextUnit get() = 22f.sp

    public val semanticFontSizeStoryBody: TextUnit get() = 18f.sp

    public val semanticFontWeightBody: FontWeight get() = FontWeight(400)

    public val semanticFontWeightEmphasis: FontWeight get() = FontWeight(700)

    public val semanticFontWeightLabel: FontWeight get() = FontWeight(600)

    public val semanticIconSize: Dp get() = 24f.dp

    public val semanticIconStroke: Dp get() = 2f.dp

    public val semanticLineHeightBody: TextUnit get() = 24f.sp

    public val semanticLineHeightCaption: TextUnit get() = 20f.sp

    public val semanticLineHeightChapter: TextUnit get() = 42f.sp

    public val semanticLineHeightSection: TextUnit get() = 28f.sp

    public val semanticLineHeightStoryBody: TextUnit get() = 28f.sp

    public val semanticMapCasing: Dp get() = 2f.dp

    public val semanticMapDash: Dp get() = 6f.dp

    public val semanticMapEstimatedWidth: Dp get() = 3f.dp

    public val semanticMapGap: Dp get() = 4f.dp

    public val semanticMapRecordedWidth: Dp get() = 4f.dp

    public val semanticMotionInstant: Duration get() = 0.milliseconds

    public val semanticMotionPanel: Duration get() = 220.milliseconds

    public val semanticMotionSelection: Duration get() = 180.milliseconds

    public val semanticPhaseActivity: Color
        get() = when (this) {
            Light -> Color(0xFF174940)
            Dark -> Color(0xFF9CD5BD)
            Outdoor -> Color(0xFF0D382D)
        }

    public val semanticPhaseChallenge: Color
        get() = when (this) {
            Light -> Color(0xFF824820)
            Dark -> Color(0xFFF3BA88)
            Outdoor -> Color(0xFF603916)
        }

    public val semanticPhaseRestDay: Color
        get() = when (this) {
            Light -> Color(0xFF49635F)
            Dark -> Color(0xFFB5C8BF)
            Outdoor -> Color(0xFF293B34)
        }

    public val semanticPhaseReturnTravel: Color
        get() = when (this) {
            Light -> Color(0xFF824820)
            Dark -> Color(0xFFF3BA88)
            Outdoor -> Color(0xFF603916)
        }

    public val semanticPhaseStay: Color
        get() = when (this) {
            Light -> Color(0xFF49635F)
            Dark -> Color(0xFFB5C8BF)
            Outdoor -> Color(0xFF293B34)
        }

    public val semanticPhaseTransfer: Color
        get() = when (this) {
            Light -> Color(0xFF285AA4)
            Dark -> Color(0xFFA9C8FF)
            Outdoor -> Color(0xFF123E81)
        }

    public val semanticPhaseTravelBefore: Color
        get() = when (this) {
            Light -> Color(0xFF824820)
            Dark -> Color(0xFFF3BA88)
            Outdoor -> Color(0xFF603916)
        }

    public val semanticRadiusCard: Dp get() = 12f.dp

    public val semanticRadiusControl: Dp get() = 8f.dp

    public val semanticRadiusTag: Dp get() = 4f.dp

    public val semanticSpaceStep12: Dp get() = 12f.dp

    public val semanticSpaceStep16: Dp get() = 16f.dp

    public val semanticSpaceStep24: Dp get() = 24f.dp

    public val semanticSpaceStep32: Dp get() = 32f.dp

    public val semanticSpaceStep4: Dp get() = 4f.dp

    public val semanticSpaceStep40: Dp get() = 40f.dp

    public val semanticSpaceStep64: Dp get() = 64f.dp

    public val semanticSpaceStep8: Dp get() = 8f.dp

    public val semanticTargetField: Dp get() = 56f.dp
}
