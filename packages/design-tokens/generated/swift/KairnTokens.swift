// Generated from packages/design-tokens/tokens. Edit the DTCG source.
import SwiftUI

// Multiply font size and line height points by a view's @ScaledMetric(relativeTo:) scale.
// Font families are ordered fallback names. Font weights provide the nearest SwiftUI weight.
// Use semanticMotionInstant with accessibilityReduceMotion. TimeInterval values are in seconds.
public enum KairnTokens: Sendable {
    case light, dark, outdoor

    public var componentCaptureButtonBackground: Color {
        switch self {
        case .light: return Self.srgb(0x174940)
        case .dark: return Self.srgb(0x9CD5BD)
        case .outdoor: return Self.srgb(0x0D382D)
        }
    }

    public var componentCaptureButtonForeground: Color {
        switch self {
        case .light: return Self.srgb(0xFFFFFF)
        case .dark: return Self.srgb(0x112B24)
        case .outdoor: return Self.srgb(0xFFFFFF)
        }
    }

    public var componentCaptureButtonMinHeight: CGFloat { 56 }

    public var componentCaptureButtonRadius: CGFloat { 8 }

    public var componentChapterHeadingFamily: [String] { ["Georgia", "serif"] }

    public var componentChapterHeadingFontSize: CGFloat { 36 }

    public var componentChapterHeadingLineHeight: CGFloat { 42 }

    public var componentMomentCardBackground: Color {
        switch self {
        case .light: return Self.srgb(0xFFFFFF)
        case .dark: return Self.srgb(0x1C2B29)
        case .outdoor: return Self.srgb(0xFFFFFF)
        }
    }

    public var componentMomentCardBorderWidth: CGFloat {
        switch self {
        case .light: return 1
        case .dark: return 1
        case .outdoor: return 2
        }
    }

    public var componentMomentCardPadding: CGFloat { 16 }

    public var componentMomentCardRadius: CGFloat { 12 }

    public var componentRouteLineCasing: CGFloat { 2 }

    public var componentRouteLineDash: CGFloat { 6 }

    public var componentRouteLineEstimated: Color {
        switch self {
        case .light: return Self.srgb(0x285AA4)
        case .dark: return Self.srgb(0xA9C8FF)
        case .outdoor: return Self.srgb(0x123E81)
        }
    }

    public var componentRouteLineEstimatedWidth: CGFloat { 3 }

    public var componentRouteLineGap: CGFloat { 4 }

    public var componentRouteLineRecorded: Color {
        switch self {
        case .light: return Self.srgb(0x174940)
        case .dark: return Self.srgb(0x9CD5BD)
        case .outdoor: return Self.srgb(0x0D382D)
        }
    }

    public var componentRouteLineRecordedWidth: CGFloat { 4 }

    public var componentSyncStatusFailed: Color {
        switch self {
        case .light: return Self.srgb(0x9D2C2D)
        case .dark: return Self.srgb(0xFFABAC)
        case .outdoor: return Self.srgb(0x761D23)
        }
    }

    public var componentSyncStatusUploaded: Color {
        switch self {
        case .light: return Self.srgb(0x21633F)
        case .dark: return Self.srgb(0x93D8AC)
        case .outdoor: return Self.srgb(0x134729)
        }
    }

    public var componentSyncStatusWaiting: Color {
        switch self {
        case .light: return Self.srgb(0x80530B)
        case .dark: return Self.srgb(0xF2C36F)
        case .outdoor: return Self.srgb(0x583900)
        }
    }

    public var semanticActivityCycling: Color {
        switch self {
        case .light: return Self.srgb(0x824820)
        case .dark: return Self.srgb(0xF3BA88)
        case .outdoor: return Self.srgb(0x603916)
        }
    }

    public var semanticActivityOther: Color {
        switch self {
        case .light: return Self.srgb(0x49635F)
        case .dark: return Self.srgb(0xB5C8BF)
        case .outdoor: return Self.srgb(0x293B34)
        }
    }

    public var semanticActivityRoadTrip: Color {
        switch self {
        case .light: return Self.srgb(0x285AA4)
        case .dark: return Self.srgb(0xA9C8FF)
        case .outdoor: return Self.srgb(0x123E81)
        }
    }

    public var semanticActivityTrek: Color {
        switch self {
        case .light: return Self.srgb(0x174940)
        case .dark: return Self.srgb(0x9CD5BD)
        case .outdoor: return Self.srgb(0x0D382D)
        }
    }

    public var semanticBorderControl: CGFloat {
        switch self {
        case .light: return 1
        case .dark: return 1
        case .outdoor: return 2
        }
    }

    public var semanticColorAction: Color {
        switch self {
        case .light: return Self.srgb(0x174940)
        case .dark: return Self.srgb(0x9CD5BD)
        case .outdoor: return Self.srgb(0x0D382D)
        }
    }

    public var semanticColorActionWash: Color {
        switch self {
        case .light: return Self.srgb(0xE1EFEA)
        case .dark: return Self.srgb(0x28453C)
        case .outdoor: return Self.srgb(0xE9F2EB)
        }
    }

    public var semanticColorBoundary: Color {
        switch self {
        case .light: return Self.srgb(0x78857E)
        case .dark: return Self.srgb(0x8A9E95)
        case .outdoor: return Self.srgb(0x31463D)
        }
    }

    public var semanticColorCanvas: Color {
        switch self {
        case .light: return Self.srgb(0xF6F3EB)
        case .dark: return Self.srgb(0x111C1B)
        case .outdoor: return Self.srgb(0xFFFFFF)
        }
    }

    public var semanticColorError: Color {
        switch self {
        case .light: return Self.srgb(0x9D2C2D)
        case .dark: return Self.srgb(0xFFABAC)
        case .outdoor: return Self.srgb(0x761D23)
        }
    }

    public var semanticColorInformation: Color {
        switch self {
        case .light: return Self.srgb(0x285AA4)
        case .dark: return Self.srgb(0xA9C8FF)
        case .outdoor: return Self.srgb(0x123E81)
        }
    }

    public var semanticColorInk: Color {
        switch self {
        case .light: return Self.srgb(0x172C2B)
        case .dark: return Self.srgb(0xF1F4EE)
        case .outdoor: return Self.srgb(0x101815)
        }
    }

    public var semanticColorOnAction: Color {
        switch self {
        case .light: return Self.srgb(0xFFFFFF)
        case .dark: return Self.srgb(0x112B24)
        case .outdoor: return Self.srgb(0xFFFFFF)
        }
    }

    public var semanticColorSecondaryText: Color {
        switch self {
        case .light: return Self.srgb(0x49635F)
        case .dark: return Self.srgb(0xB5C8BF)
        case .outdoor: return Self.srgb(0x293B34)
        }
    }

    public var semanticColorStoryAccent: Color {
        switch self {
        case .light: return Self.srgb(0x824820)
        case .dark: return Self.srgb(0xF3BA88)
        case .outdoor: return Self.srgb(0x603916)
        }
    }

    public var semanticColorSuccess: Color {
        switch self {
        case .light: return Self.srgb(0x21633F)
        case .dark: return Self.srgb(0x93D8AC)
        case .outdoor: return Self.srgb(0x134729)
        }
    }

    public var semanticColorSurface: Color {
        switch self {
        case .light: return Self.srgb(0xFFFFFF)
        case .dark: return Self.srgb(0x1C2B29)
        case .outdoor: return Self.srgb(0xFFFFFF)
        }
    }

    public var semanticColorWarning: Color {
        switch self {
        case .light: return Self.srgb(0x80530B)
        case .dark: return Self.srgb(0xF2C36F)
        case .outdoor: return Self.srgb(0x583900)
        }
    }

    public var semanticEasingSelection: CubicBezier { .init(0, 0, 0.58, 1) }

    public var semanticElevationBlur: CGFloat { 16 }

    public var semanticElevationOffsetX: CGFloat { 0 }

    public var semanticElevationOffsetY: CGFloat { 4 }

    public var semanticElevationOpacity: Double { 0.14 }

    public var semanticFontFamilyStory: [String] { ["Georgia", "serif"] }

    public var semanticFontFamilyUi: [String] { ["Source Sans 3", "system-ui", "sans-serif"] }

    public var semanticFontSizeBody: CGFloat { 16 }

    public var semanticFontSizeCaption: CGFloat { 14 }

    public var semanticFontSizeChapter: CGFloat { 36 }

    public var semanticFontSizeSection: CGFloat { 22 }

    public var semanticFontSizeStoryBody: CGFloat { 18 }

    public var semanticFontWeightBody: FontWeight { .init(value: 400, swiftUI: .regular) }

    public var semanticFontWeightEmphasis: FontWeight { .init(value: 700, swiftUI: .bold) }

    public var semanticFontWeightLabel: FontWeight { .init(value: 600, swiftUI: .semibold) }

    public var semanticIconSize: CGFloat { 24 }

    public var semanticIconStroke: CGFloat { 2 }

    public var semanticLineHeightBody: CGFloat { 24 }

    public var semanticLineHeightCaption: CGFloat { 20 }

    public var semanticLineHeightChapter: CGFloat { 42 }

    public var semanticLineHeightSection: CGFloat { 28 }

    public var semanticLineHeightStoryBody: CGFloat { 28 }

    public var semanticMapCasing: CGFloat { 2 }

    public var semanticMapDash: CGFloat { 6 }

    public var semanticMapEstimatedWidth: CGFloat { 3 }

    public var semanticMapGap: CGFloat { 4 }

    public var semanticMapRecordedWidth: CGFloat { 4 }

    public var semanticMotionInstant: TimeInterval { 0 }

    public var semanticMotionPanel: TimeInterval { 0.22 }

    public var semanticMotionSelection: TimeInterval { 0.18 }

    public var semanticPhaseActivity: Color {
        switch self {
        case .light: return Self.srgb(0x174940)
        case .dark: return Self.srgb(0x9CD5BD)
        case .outdoor: return Self.srgb(0x0D382D)
        }
    }

    public var semanticPhaseChallenge: Color {
        switch self {
        case .light: return Self.srgb(0x824820)
        case .dark: return Self.srgb(0xF3BA88)
        case .outdoor: return Self.srgb(0x603916)
        }
    }

    public var semanticPhaseRestDay: Color {
        switch self {
        case .light: return Self.srgb(0x49635F)
        case .dark: return Self.srgb(0xB5C8BF)
        case .outdoor: return Self.srgb(0x293B34)
        }
    }

    public var semanticPhaseReturnTravel: Color {
        switch self {
        case .light: return Self.srgb(0x824820)
        case .dark: return Self.srgb(0xF3BA88)
        case .outdoor: return Self.srgb(0x603916)
        }
    }

    public var semanticPhaseStay: Color {
        switch self {
        case .light: return Self.srgb(0x49635F)
        case .dark: return Self.srgb(0xB5C8BF)
        case .outdoor: return Self.srgb(0x293B34)
        }
    }

    public var semanticPhaseTransfer: Color {
        switch self {
        case .light: return Self.srgb(0x285AA4)
        case .dark: return Self.srgb(0xA9C8FF)
        case .outdoor: return Self.srgb(0x123E81)
        }
    }

    public var semanticPhaseTravelBefore: Color {
        switch self {
        case .light: return Self.srgb(0x824820)
        case .dark: return Self.srgb(0xF3BA88)
        case .outdoor: return Self.srgb(0x603916)
        }
    }

    public var semanticRadiusCard: CGFloat { 12 }

    public var semanticRadiusControl: CGFloat { 8 }

    public var semanticRadiusTag: CGFloat { 4 }

    public var semanticSpaceStep12: CGFloat { 12 }

    public var semanticSpaceStep16: CGFloat { 16 }

    public var semanticSpaceStep24: CGFloat { 24 }

    public var semanticSpaceStep32: CGFloat { 32 }

    public var semanticSpaceStep4: CGFloat { 4 }

    public var semanticSpaceStep40: CGFloat { 40 }

    public var semanticSpaceStep64: CGFloat { 64 }

    public var semanticSpaceStep8: CGFloat { 8 }

    public var semanticTargetField: CGFloat { 56 }

    public struct FontWeight: Sendable {
        public let value: Int
        public let swiftUI: Font.Weight
    }

    public struct CubicBezier: Sendable {
        public let x1: Double
        public let y1: Double
        public let x2: Double
        public let y2: Double

        fileprivate init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
            self.x1 = x1
            self.y1 = y1
            self.x2 = x2
            self.y2 = y2
        }

        public func animation(duration: TimeInterval) -> Animation {
            .timingCurve(x1, y1, x2, y2, duration: duration)
        }
    }

    private static func srgb(_ hex: UInt32) -> Color {
        Color(.sRGB,
              red: Double((hex >> 16) & 0xFF) / 255,
              green: Double((hex >> 8) & 0xFF) / 255,
              blue: Double(hex & 0xFF) / 255)
    }
}
