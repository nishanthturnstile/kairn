// Generated from packages/design-tokens/tokens. Edit the DTCG source.

const light = {
  semantic: {
    color: {
      "canvas": "#f6f3eb",
      "surface": "#ffffff",
      "ink": "#172c2b",
      "secondaryText": "#49635f",
      "boundary": "#78857e",
      "action": "#174940",
      "onAction": "#ffffff",
      "information": "#285aa4",
      "success": "#21633f",
      "warning": "#80530b",
      "error": "#9d2c2d",
      "storyAccent": "#824820",
      "actionWash": "#e1efea"
    },
    space: {
      "step4": 4,
      "step8": 8,
      "step12": 12,
      "step16": 16,
      "step24": 24,
      "step32": 32,
      "step40": 40,
      "step64": 64
    },
    radius: {
      "tag": 4,
      "control": 8,
      "card": 12
    },
    border: {
      "control": 1
    },
    target: {
      "field": 56
    },
    fontFamily: {
      "ui": [
        "Source Sans 3",
        "system-ui",
        "sans-serif"
      ],
      "story": [
        "Georgia",
        "serif"
      ]
    },
    fontSize: {
      "caption": 14,
      "body": 16,
      "storyBody": 18,
      "section": 22,
      "chapter": 36
    },
    lineHeight: {
      "caption": 20,
      "body": 24,
      "storyBody": 28,
      "section": 28,
      "chapter": 42
    },
    fontWeight: {
      "body": 400,
      "label": 600,
      "emphasis": 700
    },
    motion: {
      "instant": 0,
      "selection": 180,
      "panel": 220
    },
    easing: {
      "selection": [
        0,
        0,
        0.58,
        1
      ]
    },
    elevation: {
      "offsetX": 0,
      "offsetY": 4,
      "blur": 16,
      "opacity": 0.14
    },
    map: {
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    icon: {
      "size": 24,
      "stroke": 2
    },
    phase: {
      "travelBefore": "#824820",
      "activity": "#174940",
      "stay": "#49635f",
      "restDay": "#49635f",
      "transfer": "#285aa4",
      "challenge": "#824820",
      "returnTravel": "#824820"
    },
    activity: {
      "trek": "#174940",
      "roadTrip": "#285aa4",
      "cycling": "#824820",
      "other": "#49635f"
    },
  },
  component: {
    captureButton: {
      "background": "#174940",
      "foreground": "#ffffff",
      "minHeight": 56,
      "radius": 8
    },
    momentCard: {
      "background": "#ffffff",
      "padding": 16,
      "radius": 12,
      "borderWidth": 1
    },
    chapterHeading: {
      "family": [
        "Georgia",
        "serif"
      ],
      "fontSize": 36,
      "lineHeight": 42
    },
    routeLine: {
      "recorded": "#174940",
      "estimated": "#285aa4",
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    syncStatus: {
      "waiting": "#80530b",
      "uploaded": "#21633f",
      "failed": "#9d2c2d"
    },
  },
} as const;

const dark = {
  semantic: {
    color: {
      "canvas": "#111c1b",
      "surface": "#1c2b29",
      "ink": "#f1f4ee",
      "secondaryText": "#b5c8bf",
      "boundary": "#8a9e95",
      "action": "#9cd5bd",
      "onAction": "#112b24",
      "information": "#a9c8ff",
      "success": "#93d8ac",
      "warning": "#f2c36f",
      "error": "#ffabac",
      "storyAccent": "#f3ba88",
      "actionWash": "#28453c"
    },
    space: light.semantic.space,
    radius: light.semantic.radius,
    border: light.semantic.border,
    target: light.semantic.target,
    fontFamily: light.semantic.fontFamily,
    fontSize: light.semantic.fontSize,
    lineHeight: light.semantic.lineHeight,
    fontWeight: light.semantic.fontWeight,
    motion: light.semantic.motion,
    easing: light.semantic.easing,
    elevation: light.semantic.elevation,
    map: light.semantic.map,
    icon: light.semantic.icon,
    phase: {
      "travelBefore": "#f3ba88",
      "activity": "#9cd5bd",
      "stay": "#b5c8bf",
      "restDay": "#b5c8bf",
      "transfer": "#a9c8ff",
      "challenge": "#f3ba88",
      "returnTravel": "#f3ba88"
    },
    activity: {
      "trek": "#9cd5bd",
      "roadTrip": "#a9c8ff",
      "cycling": "#f3ba88",
      "other": "#b5c8bf"
    },
  },
  component: {
    captureButton: {
      "background": "#9cd5bd",
      "foreground": "#112b24",
      "minHeight": 56,
      "radius": 8
    },
    momentCard: {
      "background": "#1c2b29",
      "padding": 16,
      "radius": 12,
      "borderWidth": 1
    },
    chapterHeading: light.component.chapterHeading,
    routeLine: {
      "recorded": "#9cd5bd",
      "estimated": "#a9c8ff",
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    syncStatus: {
      "waiting": "#f2c36f",
      "uploaded": "#93d8ac",
      "failed": "#ffabac"
    },
  },
} as const;

const outdoor = {
  semantic: {
    color: {
      "canvas": "#ffffff",
      "surface": "#ffffff",
      "ink": "#101815",
      "secondaryText": "#293b34",
      "boundary": "#31463d",
      "action": "#0d382d",
      "onAction": "#ffffff",
      "information": "#123e81",
      "success": "#134729",
      "warning": "#583900",
      "error": "#761d23",
      "storyAccent": "#603916",
      "actionWash": "#e9f2eb"
    },
    space: light.semantic.space,
    radius: light.semantic.radius,
    border: {
      "control": 2
    },
    target: light.semantic.target,
    fontFamily: light.semantic.fontFamily,
    fontSize: light.semantic.fontSize,
    lineHeight: light.semantic.lineHeight,
    fontWeight: light.semantic.fontWeight,
    motion: light.semantic.motion,
    easing: light.semantic.easing,
    elevation: light.semantic.elevation,
    map: light.semantic.map,
    icon: light.semantic.icon,
    phase: {
      "travelBefore": "#603916",
      "activity": "#0d382d",
      "stay": "#293b34",
      "restDay": "#293b34",
      "transfer": "#123e81",
      "challenge": "#603916",
      "returnTravel": "#603916"
    },
    activity: {
      "trek": "#0d382d",
      "roadTrip": "#123e81",
      "cycling": "#603916",
      "other": "#293b34"
    },
  },
  component: {
    captureButton: {
      "background": "#0d382d",
      "foreground": "#ffffff",
      "minHeight": 56,
      "radius": 8
    },
    momentCard: {
      "background": "#ffffff",
      "padding": 16,
      "radius": 12,
      "borderWidth": 2
    },
    chapterHeading: light.component.chapterHeading,
    routeLine: {
      "recorded": "#0d382d",
      "estimated": "#123e81",
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    syncStatus: {
      "waiting": "#583900",
      "uploaded": "#134729",
      "failed": "#761d23"
    },
  },
} as const;

export const themes = { light, dark, outdoor } as const;
