import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeOutputs } from "./native.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const banner =
  "Generated from packages/design-tokens/tokens. Edit the DTCG source.";

async function readTokens(name) {
  const file = resolve(root, "tokens", `${name}.tokens.json`);
  const tokens = new Map();
  function visit(group, path, type) {
    if (Object.hasOwn(group, "$value")) {
      if (
        path.length !== 3 ||
        !["primitive", "semantic", "component"].includes(path[0])
      ) {
        throw new Error(`Expected tier.group.role at ${path.join(".")}`);
      }
      tokens.set(path.join("."), { path, type, value: group.$value });
      return;
    }
    for (const [name, entry] of Object.entries(group)) {
      if (name.startsWith("$")) continue;
      if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
        throw new Error(`Invalid token name in ${file}: ${name}`);
      }
      visit(entry, [...path, name], entry.$type ?? type);
    }
  }
  visit(JSON.parse(await readFile(file, "utf8")), []);
  return tokens;
}

function normalise(type, value) {
  switch (type) {
    case "color": {
      const { colorSpace, components, alpha = 1 } = value;
      if (
        colorSpace !== "srgb" ||
        alpha !== 1 ||
        components?.length !== 3 ||
        !components.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
      )
        break;
      return (
        "#" +
        components
          .map((v) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    }
    case "duration":
    case "dimension":
      if (
        value.unit === (type === "duration" ? "ms" : "px") &&
        Number.isFinite(value.value)
      )
        return value.value;
      break;
    case "fontFamily":
      if (
        Array.isArray(value) &&
        value.length &&
        value.every((v) => typeof v === "string" && v.length)
      )
        return value;
      break;
    case "fontWeight":
      if (Number.isInteger(value) && value >= 1 && value <= 1000) return value;
      break;
    case "number":
      if (Number.isFinite(value)) return value;
      break;
    case "cubicBezier":
      if (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every(Number.isFinite) &&
        [value[0], value[2]].every((v) => v >= 0 && v <= 1)
      )
        return value;
  }
  throw new Error(`Unsupported ${type} token value ${JSON.stringify(value)}`);
}

function resolveTheme(tokens) {
  const resolved = new Map();
  const visiting = new Set();
  function visit(key) {
    if (resolved.has(key)) return resolved.get(key);
    if (visiting.has(key)) throw new Error(`Circular alias at ${key}`);
    visiting.add(key);
    const token = tokens.get(key);
    if (!token) throw new Error(`Missing token ${key}`);
    let { type, value } = token;
    const alias = typeof value === "string" && /^\{([^{}]+)\}$/.exec(value);
    if (alias) {
      const target = visit(alias[1]);
      if (
        (token.path[0] === "component" && target.path[0] !== "semantic") ||
        (token.path[0] === "semantic" && target.path[0] === "component")
      ) {
        throw new Error(`Invalid tier reference at ${key}`);
      }
      if (type && type !== target.type)
        throw new Error(`Alias type mismatch at ${key}`);
      ({ type, value } = target);
    } else {
      if (token.path[0] !== "primitive")
        throw new Error(`${key} needs an alias`);
      value = normalise(type, value);
    }
    const result = { path: token.path, type, value };
    visiting.delete(key);
    resolved.set(key, result);
    return result;
  }
  return Array.from(tokens.keys(), visit).filter(
    (token) => token.path[0] !== "primitive",
  );
}

const base = await readTokens("base");
const themes = { light: resolveTheme(base) };
for (const mode of ["dark", "outdoor"]) {
  const merged = new Map(base);
  for (const [key, token] of await readTokens(mode)) {
    if (!base.has(key) || token.path[0] !== "semantic")
      throw new Error(`Invalid ${mode} override: ${key}`);
    merged.set(key, token);
  }
  themes[mode] = resolveTheme(merged);
  themes[mode].forEach((token, i) => {
    if (token.type !== themes.light[i].type)
      throw new Error(`Type changed in ${mode}: ${token.path.join(".")}`);
  });
}

const kebab = (name) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const cssName = (token) => `--kairn-${token.path.map(kebab).join("-")}`;
function cssValue({ path, type, value }) {
  switch (type) {
    case "duration":
      return `${value}ms`;
    case "dimension":
      return path.some((part) =>
        ["space", "fontSize", "lineHeight", "padding"].includes(part),
      )
        ? `${value / 16}rem`
        : `${value}px`;
    case "fontFamily":
      return value
        .map((name) => (name.includes(" ") ? JSON.stringify(name) : name))
        .join(", ");
    case "cubicBezier":
      return `cubic-bezier(${value.join(", ")})`;
    default:
      return String(value);
  }
}

function cssRule(selector, tokens, scheme) {
  return (
    selector +
    " {\n" +
    (scheme ? `  color-scheme: ${scheme};\n` : "") +
    tokens.map((t) => `  ${cssName(t)}: ${cssValue(t)};`).join("\n") +
    "\n}"
  );
}
const css = [`/* ${banner} */`, cssRule(":root", themes.light, "light")];
for (const mode of ["dark", "outdoor"]) {
  const changed = themes[mode].filter(
    (t, i) => cssValue(t) !== cssValue(themes.light[i]),
  );
  css.push(
    cssRule(
      `:root[data-appearance="${mode}"]`,
      changed,
      mode === "dark" ? "dark" : "light",
    ),
  );
  if (mode === "dark")
    css.push(
      "@media (prefers-color-scheme: dark) {\n" +
        cssRule(":root:not([data-appearance])", changed, "dark") +
        "\n}",
    );
}
css.push(
  "@media (prefers-reduced-motion: reduce) {\n" +
    cssRule(
      ":root",
      themes.light
        .filter((t) => t.type === "duration")
        .map((t) => ({ ...t, value: 0 })),
    ) +
    "\n}",
);

// The three TS exports share unchanged groups. Native apps bundle only runtime values.
const ts = [`// ${banner}`];
for (const [mode, tokens] of Object.entries(themes)) {
  const tree = {};
  for (const {
    path: [tier, group, name],
    value,
  } of tokens) {
    tree[tier] ??= {};
    tree[tier][group] ??= {};
    tree[tier][group][name] = value;
  }
  const code = [`const ${mode} = {`];
  for (const [tier, groups] of Object.entries(tree)) {
    code.push(`  ${tier}: {`);
    for (const [group, leaves] of Object.entries(groups)) {
      const changed =
        mode === "light" ||
        tokens.some(
          (t, i) =>
            t.path[0] === tier &&
            t.path[1] === group &&
            cssValue(t) !== cssValue(themes.light[i]),
        );
      code.push(
        `    ${group}: ${changed ? JSON.stringify(leaves, null, 2).replaceAll("\n", "\n    ") : `light.${tier}.${group}`},`,
      );
    }
    code.push("  },");
  }
  ts.push([...code, "} as const;"].join("\n"));
}
ts.push("export const themes = { light, dark, outdoor } as const;");
const outputs = {
  "generated/tokens.css": `${css.join("\n\n")}\n`,
  "src/generated/themes.ts": `${ts.join("\n\n")}\n`,
  ...nativeOutputs(themes),
};
for (const [path, content] of Object.entries(outputs)) {
  const file = resolve(root, path);
  if (check) {
    if ((await readFile(file, "utf8")) !== content)
      throw new Error(`Stale ${path}. Run pnpm tokens:generate.`);
  } else {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}
