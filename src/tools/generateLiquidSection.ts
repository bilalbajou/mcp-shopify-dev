import { z } from "zod";
import type { ShopifyTool } from "../lib/types.js";

// ── Setting definition ────────────────────────────────────────────────────────

const SettingTypeEnum = z.enum([
  "text",
  "textarea",
  "richtext",
  "inline_richtext",
  "image_picker",
  "video",
  "url",
  "color",
  "color_scheme",
  "font_picker",
  "select",
  "radio",
  "checkbox",
  "number",
  "range",
  "collection",
  "product",
  "blog",
  "page",
  "link_list",
  "liquid",
  "header",
  "paragraph",
]);

const SettingSchema = z.object({
  type: SettingTypeEnum,
  id: z.string().optional().describe("Setting ID used in Liquid: {{ section.settings.<id> }}. Not needed for header/paragraph."),
  label: z.string().describe("Human-readable label shown in the theme editor"),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  info: z.string().optional().describe("Help text shown below the setting"),
  placeholder: z.string().optional(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional()
    .describe("Required for select and radio types"),
  min: z.number().optional().describe("For range/number"),
  max: z.number().optional().describe("For range/number"),
  step: z.number().optional().describe("For range"),
  unit: z.string().optional().describe("For range, e.g. 'px' or 'rem'"),
  content: z.string().optional().describe("Text content for header/paragraph types"),
});

const BlockSchema = z.object({
  type: z.string().describe("Block type identifier, e.g. 'text', 'image', 'button'"),
  name: z.string().describe("Human-readable block name shown in the theme editor"),
  settings: z.array(SettingSchema).optional(),
  limit: z.number().int().optional().describe("Maximum number of this block type allowed"),
});

// ── Tool input ────────────────────────────────────────────────────────────────

const GenerateLiquidSectionInputSchema = z.object({
  name: z.string().describe("Section name as shown in the theme editor, e.g. 'Hero Banner'"),
  tag: z
    .enum(["section", "div", "article", "aside", "footer", "header", "main"])
    .default("section")
    .describe("HTML wrapper element for the section"),
  cssClass: z
    .string()
    .optional()
    .describe("CSS class added to the wrapper element. Auto-generated from name if omitted."),
  settings: z.array(SettingSchema).optional().describe("Section-level settings"),
  blocks: z.array(BlockSchema).optional().describe("Block type definitions"),
  maxBlocks: z
    .number()
    .int()
    .optional()
    .describe("Maximum total blocks allowed in the section"),
  presets: z
    .boolean()
    .default(true)
    .describe("Include a preset so the section appears in Add section"),
  includeStylesheet: z
    .boolean()
    .default(false)
    .describe("Include an empty {% stylesheet %} tag"),
  includeJavascript: z
    .boolean()
    .default(false)
    .describe("Include an empty {% javascript %} tag"),
});

type GenerateLiquidSectionInput = z.infer<typeof GenerateLiquidSectionInputSchema>;
type SettingDef = z.infer<typeof SettingSchema>;
type BlockDef = z.infer<typeof BlockSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build the schema JSON object (pretty-printed). */
function buildSchemaJson(
  input: GenerateLiquidSectionInput,
  cssClass: string
): string {
  const schema: Record<string, any> = {
    name: input.name,
    tag: input.tag,
    class: cssClass,
  };

  if (input.settings && input.settings.length > 0) {
    schema.settings = input.settings.map(buildSettingSchema);
  }

  if (input.blocks && input.blocks.length > 0) {
    schema.blocks = input.blocks.map(buildBlockSchema);
  }

  if (input.maxBlocks !== undefined) {
    schema.max_blocks = input.maxBlocks;
  }

  if (input.presets) {
    schema.presets = [{ name: input.name }];
  }

  return JSON.stringify(schema, null, 2);
}

function buildSettingSchema(s: SettingDef): Record<string, any> {
  const out: Record<string, any> = { type: s.type, label: s.label };
  if (s.id) out.id = s.id;
  if (s.info) out.info = s.info;
  if (s.placeholder !== undefined) out.placeholder = s.placeholder;
  if (s.content !== undefined) out.content = s.content;
  if (s.default !== undefined) out.default = s.default;
  if (s.options) out.options = s.options;
  if (s.min !== undefined) out.min = s.min;
  if (s.max !== undefined) out.max = s.max;
  if (s.step !== undefined) out.step = s.step;
  if (s.unit !== undefined) out.unit = s.unit;
  return out;
}

function buildBlockSchema(b: BlockDef): Record<string, any> {
  const out: Record<string, any> = { type: b.type, name: b.name };
  if (b.limit !== undefined) out.limit = b.limit;
  if (b.settings && b.settings.length > 0) {
    out.settings = b.settings.map(buildSettingSchema);
  }
  return out;
}

/** Generate the Liquid HTML markup with usage hints for each setting. */
function buildLiquidMarkup(
  input: GenerateLiquidSectionInput,
  cssClass: string
): string {
  const lines: string[] = [];
  const slug = slugify(input.name);

  lines.push(`<${input.tag} class="{{ section.settings.color_scheme | default: '${cssClass}' }}" id="shopify-section-{{ section.id }}">`);
  lines.push(`  <div class="${cssClass}__container">`);
  lines.push(``);

  if (input.settings && input.settings.length > 0) {
    for (const s of input.settings) {
      if (!s.id || s.type === "header" || s.type === "paragraph") continue;
      const snippet = renderSettingMarkup(s, "section.settings");
      if (snippet) {
        lines.push(`    ` + snippet.split("\n").join("\n    "));
        lines.push(``);
      }
    }
  }

  if (input.blocks && input.blocks.length > 0) {
    lines.push(`    {%- for block in section.blocks -%}`);
    lines.push(`      {%- case block.type -%}`);
    for (const block of input.blocks) {
      lines.push(`        {%- when '${block.type}' -%}`);
      lines.push(`          <div class="${cssClass}__block ${cssClass}__block--${block.type}" {{ block.shopify_attributes }}>`);
      if (block.settings && block.settings.length > 0) {
        for (const s of block.settings) {
          if (!s.id || s.type === "header" || s.type === "paragraph") continue;
          const snippet = renderSettingMarkup(s, "block.settings");
          if (snippet) {
            lines.push(`            ` + snippet.split("\n").join("\n            "));
          }
        }
      } else {
        lines.push(`            {%- comment -%} Add block content here {%- endcomment -%}`);
      }
      lines.push(`          </div>`);
    }
    lines.push(`      {%- endcase -%}`);
    lines.push(`    {%- endfor -%}`);
    lines.push(``);
  }

  lines.push(`  </div>`);
  lines.push(`</${input.tag}>`);

  return lines.join("\n");
}

function renderSettingMarkup(s: SettingDef, prefix: string): string | null {
  if (!s.id) return null;
  const ref = `${prefix}.${s.id}`;

  switch (s.type) {
    case "text":
    case "inline_richtext":
      return `{%- if ${ref} != blank -%}\n  <p class="section__text">{{ ${ref} }}</p>\n{%- endif -%}`;

    case "textarea":
    case "richtext":
      return `{%- if ${ref} != blank -%}\n  <div class="section__richtext">{{ ${ref} }}</div>\n{%- endif -%}`;

    case "image_picker":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  {{\n` +
        `    ${ref}\n` +
        `    | image_url: width: 1920\n` +
        `    | image_tag:\n` +
        `        loading: 'lazy',\n` +
        `        class: 'section__image',\n` +
        `        widths: '375, 750, 1100, 1500, 1780, 2000'\n` +
        `  }}\n` +
        `{%- endif -%}`
      );

    case "video":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  <div class="section__video">\n` +
        `    {%- render 'video', video: ${ref} -%}\n` +
        `  </div>\n` +
        `{%- endif -%}`
      );

    case "url":
      return `{%- if ${ref} != blank -%}\n  <a href="{{ ${ref} }}" class="section__link">{{ 'sections.${s.id}.label' | t }}</a>\n{%- endif -%}`;

    case "color":
      return `{%- if ${ref} != blank -%}\n  {%- assign ${s.id}_color = ${ref} -%}\n{%- endif -%}`;

    case "color_scheme":
      return `{%- comment -%} Color scheme applied via section class attribute {%- endcomment -%}`;

    case "font_picker":
      return (
        `{%- style -%}\n` +
        `  .${s.id}-font { font-family: {{ ${ref}.family }}, {{ ${ref}.fallback_families }}; font-weight: {{ ${ref}.weight }}; font-style: {{ ${ref}.style }}; }\n` +
        `{%- endstyle -%}`
      );

    case "checkbox":
      return `{%- if ${ref} -%}\n  {%- comment -%} ${s.label} is enabled {%- endcomment -%}\n{%- endif -%}`;

    case "select":
    case "radio":
      return `{%- comment -%} ${s.label}: {{ ${ref} }} {%- endcomment -%}`;

    case "number":
    case "range":
      return `{%- comment -%} ${s.label}: {{ ${ref} }} {%- endcomment -%}`;

    case "collection":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  {%- for product in ${ref}.products limit: 4 -%}\n` +
        `    <div class="section__product-card">{{ product.title }}</div>\n` +
        `  {%- endfor -%}\n` +
        `{%- endif -%}`
      );

    case "product":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  <div class="section__product">\n` +
        `    <a href="{{ ${ref}.url }}">{{ ${ref}.title }}</a>\n` +
        `  </div>\n` +
        `{%- endif -%}`
      );

    case "blog":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  {%- for article in ${ref}.articles limit: 3 -%}\n` +
        `    <div class="section__article"><a href="{{ article.url }}">{{ article.title }}</a></div>\n` +
        `  {%- endfor -%}\n` +
        `{%- endif -%}`
      );

    case "page":
      return `{%- if ${ref} != blank -%}\n  <div class="section__page">{{ ${ref}.content }}</div>\n{%- endif -%}`;

    case "link_list":
      return (
        `{%- if ${ref} != blank -%}\n` +
        `  <nav class="section__nav">\n` +
        `    {%- for link in ${ref}.links -%}\n` +
        `      <a href="{{ link.url }}" class="section__nav-link">{{ link.title }}</a>\n` +
        `    {%- endfor -%}\n` +
        `  </nav>\n` +
        `{%- endif -%}`
      );

    case "liquid":
      return `{{ ${ref} }}`;

    default:
      return null;
  }
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export const generateLiquidSection: ShopifyTool = {
  name: "generate-liquid-section",
  description:
    "Generate a complete, ready-to-upload Shopify Liquid section file (.liquid) from a structured spec. Produces the HTML markup with setting references, a valid {% schema %} block, and optional stylesheet/javascript tags. Pass the returned 'liquidCode' directly to upsert-theme-file.",
  schema: GenerateLiquidSectionInputSchema,

  // No initialize: does not call Shopify API
  execute: async (input: GenerateLiquidSectionInput) => {
    const cssClass = input.cssClass ?? slugify(input.name);
    const parts: string[] = [];

    // 1. HTML markup
    parts.push(buildLiquidMarkup(input, cssClass));
    parts.push("");

    // 2. Schema
    parts.push("{% schema %}");
    parts.push(buildSchemaJson(input, cssClass));
    parts.push("{% endschema %}");

    // 3. Optional stylesheet
    if (input.includeStylesheet) {
      parts.push("");
      parts.push("{% stylesheet %}");
      parts.push(`/* Styles for the ${input.name} section */`);
      parts.push(`.${cssClass} {}`);
      parts.push(`.${cssClass}__container {}`);
      parts.push("{% endstylesheet %}");
    }

    // 4. Optional javascript
    if (input.includeJavascript) {
      parts.push("");
      parts.push("{% javascript %}");
      parts.push(`/* JavaScript for the ${input.name} section */`);
      parts.push("{% endjavascript %}");
    }

    const liquidCode = parts.join("\n");

    return {
      filename: `sections/${cssClass}.liquid`,
      liquidCode,
      schemaJson: buildSchemaJson(input, cssClass),
      instructions:
        "Pass 'liquidCode' as the 'content' parameter to upsert-theme-file with the suggested 'filename'. Review and refine the generated markup before uploading to a MAIN theme.",
    };
  },
};
