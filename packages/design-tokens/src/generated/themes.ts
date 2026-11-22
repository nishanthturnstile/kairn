// Generated from packages/design-tokens/tokens. Edit the DTCG source.

const light = {
  semantic: {
    color: {
      "focus": "#4f6334",
      "key": "#d3f477",
      "keyInk": "#22271b",
      "divider": "#d9dbd0",
      "citron": "#d3f477",
      "dock": "#262922",
      "dockInk": "#e5e7da",
      "lilac": "#dcd4f1",
      "clay": "#e8a483",
      "canvas": "#fbfaf6",
      "surface": "#fffefa",
      "ink": "#20221d",
      "secondaryText": "#61645a",
      "boundary": "#787c6f",
      "action": "#24271f",
      "onAction": "#fffef8",
      "information": "#285aa4",
      "success": "#3b602c",
      "warning": "#80530b",
      "error": "#a53126",
      "storyAccent": "#824820",
      "actionWash": "#eeefe7"
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
      "control": 6,
      "card": 10
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
      "activity": "#24271f",
      "stay": "#61645a",
      "restDay": "#61645a",
      "transfer": "#285aa4",
      "challenge": "#824820",
      "returnTravel": "#824820"
    },
    activity: {
      "trek": "#24271f",
      "roadTrip": "#285aa4",
      "cycling": "#824820",
      "other": "#61645a"
    },
  },
  component: {
    captureButton: {
      "background": "#24271f",
      "foreground": "#fffef8",
      "minHeight": 56,
      "radius": 6
    },
    momentCard: {
      "background": "#fffefa",
      "padding": 16,
      "radius": 10,
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
      "recorded": "#24271f",
      "estimated": "#285aa4",
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    syncStatus: {
      "waiting": "#80530b",
      "uploaded": "#3b602c",
      "failed": "#a53126"
    },
  },
} as const;

const dark = {
  semantic: {
    color: {
      "focus": "#d3f477",
      "key": "#28331e",
      "keyInk": "#d3f477",
      "divider": "#42473d",
      "citron": "#d3f477",
      "dock": "#262922",
      "dockInk": "#e5e7da",
      "lilac": "#dcd4f1",
      "clay": "#e8a483",
      "canvas": "#1b1d1a",
      "surface": "#252823",
      "ink": "#f1f2e7",
      "secondaryText": "#bdc0b3",
      "boundary": "#919786",
      "action": "#d3f477",
      "onAction": "#1c2315",
      "information": "#a9c8ff",
      "success": "#b5df9d",
      "warning": "#f2c36f",
      "error": "#ffa49c",
      "storyAccent": "#f3ba88",
      "actionWash": "#34392f"
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
      "activity": "#d3f477",
      "stay": "#bdc0b3",
      "restDay": "#bdc0b3",
      "transfer": "#a9c8ff",
      "challenge": "#f3ba88",
      "returnTravel": "#f3ba88"
    },
    activity: {
      "trek": "#d3f477",
      "roadTrip": "#a9c8ff",
      "cycling": "#f3ba88",
      "other": "#bdc0b3"
    },
  },
  component: {
    captureButton: {
      "background": "#d3f477",
      "foreground": "#1c2315",
      "minHeight": 56,
      "radius": 6
    },
    momentCard: {
      "background": "#252823",
      "padding": 16,
      "radius": 10,
      "borderWidth": 1
    },
    chapterHeading: light.component.chapterHeading,
    routeLine: {
      "recorded": "#d3f477",
      "estimated": "#a9c8ff",
      "recordedWidth": 4,
      "estimatedWidth": 3,
      "dash": 6,
      "gap": 4,
      "casing": 2
    },
    syncStatus: {
      "waiting": "#f2c36f",
      "uploaded": "#b5df9d",
      "failed": "#ffa49c"
    },
  },
} as const;

const outdoor = {
  semantic: {
    color: {
      "focus": "#123e81",
      "key": "#d3f477",
      "keyInk": "#22271b",
      "divider": "#31463d",
      "citron": "#d3f477",
      "dock": "#262922",
      "dockInk": "#e5e7da",
      "lilac": "#dcd4f1",
      "clay": "#e8a483",
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
      "radius": 6
    },
    momentCard: {
      "background": "#ffffff",
      "padding": 16,
      "radius": 10,
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
