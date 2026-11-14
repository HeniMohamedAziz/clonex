import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import prettier from 'prettier';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const ATTR_MAP = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  frameborder: 'frameBorder',
  allowfullscreen: 'allowFullScreen',
  crossorigin: 'crossOrigin',
  srcset: 'srcSet',
  charset: 'charSet',
  'http-equiv': 'httpEquiv',
  'accept-charset': 'acceptCharset',
  accesskey: 'accessKey',
  contenteditable: 'contentEditable',
  contextmenu: 'contextMenu',
  datetime: 'dateTime',
  enctype: 'encType',
  formaction: 'formAction',
  formenctype: 'formEncType',
  formmethod: 'formMethod',
  formnovalidate: 'formNoValidate',
  formtarget: 'formTarget',
  hreflang: 'hrefLang',
  inputmode: 'inputMode',
  novalidate: 'noValidate',
  marginwidth: 'marginWidth',
  marginheight: 'marginHeight',
  spellcheck: 'spellCheck',
  srcdoc: 'srcDoc',
  srclang: 'srcLang',
  usemap: 'useMap',
  'accent-height': 'accentHeight',
  'alignment-baseline': 'alignmentBaseline',
  'arabic-form': 'arabicForm',
  'baseline-shift': 'baselineShift',
  'cap-height': 'capHeight',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'color-interpolation': 'colorInterpolation',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'color-profile': 'colorProfile',
  'color-rendering': 'colorRendering',
  'dominant-baseline': 'dominantBaseline',
  'enable-background': 'enableBackground',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-size-adjust': 'fontSizeAdjust',
  'font-stretch': 'fontStretch',
  'font-style': 'fontStyle',
  'font-variant': 'fontVariant',
  'font-weight': 'fontWeight',
  'glyph-name': 'glyphName',
  'glyph-orientation-horizontal': 'glyphOrientationHorizontal',
  'glyph-orientation-vertical': 'glyphOrientationVertical',
  'horiz-adv-x': 'horizAdvX',
  'horiz-origin-x': 'horizOriginX',
  'image-rendering': 'imageRendering',
  'letter-spacing': 'letterSpacing',
  'lighting-color': 'lightingColor',
  'marker-end': 'markerEnd',
  'marker-mid': 'markerMid',
  'marker-start': 'markerStart',
  'overline-position': 'overlinePosition',
  'overline-thickness': 'overlineThickness',
  'paint-order': 'paintOrder',
  'panose-1': 'panose1',
  'pointer-events': 'pointerEvents',
  'rendering-intent': 'renderingIntent',
  'shape-rendering': 'shapeRendering',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'strikethrough-position': 'strikethroughPosition',
  'strikethrough-thickness': 'strikethroughThickness',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'text-anchor': 'textAnchor',
  'text-decoration': 'textDecoration',
  'text-rendering': 'textRendering',
  'underline-position': 'underlinePosition',
  'underline-thickness': 'underlineThickness',
  'unicode-bidi': 'unicodeBidi',
  'unicode-range': 'unicodeRange',
  'units-per-em': 'unitsPerEm',
  'v-alphabetic': 'vAlphabetic',
  'v-hanging': 'vHanging',
  'v-ideographic': 'vIdeographic',
  'v-mathematical': 'vMathematical',
  'vector-effect': 'vectorEffect',
  'vert-adv-y': 'vertAdvY',
  'vert-origin-x': 'vertOriginX',
  'vert-origin-y': 'vertOriginY',
  'word-spacing': 'wordSpacing',
  'writing-mode': 'writingMode',
  'x-height': 'xHeight',
  'xlink:actuate': 'xlinkActuate',
  'xlink:arcrole': 'xlinkArcrole',
  'xlink:href': 'xlinkHref',
  'xlink:role': 'xlinkRole',
  'xlink:show': 'xlinkShow',
  'xlink:title': 'xlinkTitle',
  'xlink:type': 'xlinkType',
  'xml:base': 'xmlBase',
  'xml:lang': 'xmlLang',
  'xml:space': 'xmlSpace',
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  patternunits: 'patternUnits',
  patterntransform: 'patternTransform',
  clippathunits: 'clipPathUnits',
  maskunits: 'maskUnits',
  maskcontentunits: 'maskContentUnits',
  filterunits: 'filterUnits',
  primitiveunits: 'primitiveUnits',
  stddeviation: 'stdDeviation',
  specularconstant: 'specularConstant',
  specularexponent: 'specularExponent',
  surfacescale: 'surfaceScale',
  fecomposite: 'feComposite',
  fegaussianblur: 'feGaussianBlur',
  fecolormatrix: 'feColorMatrix',
  feblend: 'feBlend',
  feoffset: 'feOffset',
  femerge: 'feMerge',
  femergenode: 'feMergeNode',
  feflood: 'feFlood'
};

function parseStyleStringToJsxObject(styleStr) {
  if (!styleStr || !styleStr.trim()) return null;
  const declarations = [];
  let current = '';
  let parenDepth = 0;
  let quoteChar = null;

  for (let i = 0; i < styleStr.length; i++) {
    const ch = styleStr[i];
    if (quoteChar) {
      if (ch === quoteChar && styleStr[i - 1] !== '\\') quoteChar = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quoteChar = ch;
      current += ch;
    } else if (ch === '(') {
      parenDepth++;
      current += ch;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += ch;
    } else if (ch === ';' && parenDepth === 0) {
      if (current.trim()) declarations.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) declarations.push(current.trim());

  const entries = [];
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const rawProp = decl.slice(0, colonIdx).trim();
    const rawVal = decl
      .slice(colonIdx + 1)
      .trim()
      .replace(/!important\s*$/i, '')
      .trim();
    if (!rawProp || !rawVal) continue;

    let jsxKey;
    if (rawProp.startsWith('--')) {
      jsxKey = JSON.stringify(rawProp);
    } else {
      const camel = rawProp
        .toLowerCase()
        .replace(/^-ms-/, 'ms-')
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      jsxKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(camel) ? camel : JSON.stringify(camel);
    }
    entries.push(`${jsxKey}: ${JSON.stringify(rawVal)}`);
  }

  if (entries.length === 0) return null;
  return `{{ ${entries.join(', ')} }}`;
}

function domNodeToJsx(node, $) {
  if (!node) return '';

  if (node.type === 'text') {
    const text = node.data || '';
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{/g, "{'{'}")
      .replace(/\}/g, "{'}'}");
  }

  if (node.type === 'comment') {
    return '';
  }

  if (node.type === 'tag' || node.type === 'style' || node.type === 'script') {
    let tagName = node.name || 'div';
    if (ATTR_MAP[tagName.toLowerCase()] && tagName.toLowerCase().startsWith('fe')) {
      tagName = ATTR_MAP[tagName.toLowerCase()];
    } else if (tagName === 'lineargradient') {
      tagName = 'linearGradient';
    } else if (tagName === 'radialgradient') {
      tagName = 'radialGradient';
    } else if (tagName === 'clippath') {
      tagName = 'clipPath';
    } else if (tagName === 'foreignobject') {
      tagName = 'foreignObject';
    } else if (tagName === 'textpath') {
      tagName = 'textPath';
    }

    if (tagName.includes(':')) {
      tagName = tagName.split(':').pop() || 'div';
    }

    const isCustomElement = tagName.includes('-');
    const rawAttrs = node.attribs || {};
    const jsxAttrs = [];

    for (const [rawName, rawVal] of Object.entries(rawAttrs)) {
      const lowerName = rawName.toLowerCase();

      if (lowerName.startsWith('on')) continue;
      if (lowerName.startsWith('xmlns:') || lowerName === 'xml:space') continue;

      if (lowerName === 'style') {
        const styleObj = parseStyleStringToJsxObject(rawVal);
        if (styleObj) {
          jsxAttrs.push(`style=${styleObj}`);
        }
        continue;
      }

      if (lowerName === 'value' && (tagName === 'input' || tagName === 'textarea' || tagName === 'select')) {
        jsxAttrs.push(`defaultValue=${JSON.stringify(rawVal)}`);
        continue;
      }

      if (lowerName === 'checked' && tagName === 'input') {
        jsxAttrs.push('defaultChecked');
        continue;
      }

      let attrName = isCustomElement
        ? lowerName === 'class'
          ? 'class'
          : rawName
        : ATTR_MAP[lowerName] || ATTR_MAP[rawName] || rawName;

      if (lowerName.startsWith('data-') || lowerName.startsWith('aria-')) {
        attrName = lowerName;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(attrName)) {
        continue;
      }

      if (
        !isCustomElement &&
        attrName.includes('-') &&
        !attrName.startsWith('data-') &&
        !attrName.startsWith('aria-')
      ) {
        attrName = attrName.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      }

      if (rawVal === '' && (attrName === 'disabled' || attrName === 'required' || attrName === 'readOnly' || attrName === 'multiple' || attrName === 'hidden')) {
        jsxAttrs.push(attrName);
      } else {
        jsxAttrs.push(`${attrName}=${JSON.stringify(rawVal)}`);
      }
    }

    const attrString = jsxAttrs.length > 0 ? ' ' + jsxAttrs.join(' ') : '';
    const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());

    if (isVoid) {
      return `<${tagName}${attrString} />`;
    }

    if (tagName === 'textarea') {
      const val = $(node).text() || '';
      return `<textarea${attrString} defaultValue=${JSON.stringify(val)} />`;
    }

    const childrenJsx = (node.children || [])
      .map((child) => domNodeToJsx(child, $))
      .join('');

    return `<${tagName}${attrString}>${childrenJsx}</${tagName}>`;
  }

  return '';
}

function inferComponentName(node, index, usedNames) {
  const tag = (node.name || 'div').toLowerCase();
  const attribs = node.attribs || {};
  const id = attribs.id || '';
  const className = attribs.class || '';
  const ariaLabel = attribs['aria-label'] || '';

  let baseName = '';
  if (tag === 'header') baseName = 'HeaderSection';
  else if (tag === 'nav') baseName = 'NavbarSection';
  else if (tag === 'footer') baseName = 'FooterSection';
  else if (tag === 'aside') baseName = 'SidebarSection';
  else if (id) {
    const cleaned = id
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    if (cleaned && /^[A-Z]/.test(cleaned)) {
      baseName = `${cleaned}Section`;
    }
  }

  if (!baseName && ariaLabel) {
    const cleaned = ariaLabel
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    if (cleaned && /^[A-Z]/.test(cleaned)) {
      baseName = `${cleaned}Section`;
    }
  }

  if (!baseName && className) {
    const semanticMatch = className.match(/\b(hero|banner|navbar|header|features|pricing|testimonials|faq|cta|footer|contact|about|gallery|stats)\b/i);
    if (semanticMatch) {
      const word = semanticMatch[1];
      baseName = `${word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()}Section`;
    }
  }

  if (!baseName) {
    baseName = tag === 'main' ? 'MainSection' : `PageSection${index + 1}`;
  }

  let finalName = baseName;
  let counter = 2;
  while (usedNames.has(finalName)) {
    finalName = `${baseName}${counter++}`;
  }
  usedNames.add(finalName);
  return finalName;
}

async function buildComponentFile(componentName, node, $) {
  const jsxBody = domNodeToJsx(node, $);
  const rawComponentSource = `import React from 'react';

export default function ${componentName}() {
  return (
    <>
      ${jsxBody}
    </>
  );
}
`;

  try {
    const formatted = await prettier.format(rawComponentSource, {
      parser: 'babel',
      printWidth: 100,
      singleQuote: true,
      jsxSingleQuote: false
    });
    return { code: formatted, mode: 'jsx' };
  } catch {
    const rawHtml = $.html(node);
    const safeSource = `import React from 'react';

const sectionHtml = ${JSON.stringify(rawHtml)};

export default function ${componentName}() {
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: sectionHtml }} />;
}
`;
    return { code: safeSource, mode: 'html-fallback' };
  }
}

export async function generateReactProject(htmlGenResult, designTokens, outputDir, options = {}) {
  const { onProgress = () => {} } = options;
  const reactDir = path.join(outputDir, 'react');
  const srcDir = path.join(reactDir, 'src');
  const componentsDir = path.join(srcDir, 'components');
  const publicDir = path.join(reactDir, 'public');

  await fs.mkdir(componentsDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  onProgress('Generating React components...');

  const sourceAssetsDir = path.join(outputDir, 'assets');
  const targetAssetsDir = path.join(publicDir, 'assets');
  try {
    await fs.cp(sourceAssetsDir, targetAssetsDir, { recursive: true });
  } catch {}

  const $ = cheerio.load(`<body>${htmlGenResult.cleanedBodyHtml}</body>`, {
    decodeEntities: false
  });

  const wrappers = [];
  let topNodes = $('body')
    .contents()
    .toArray()
    .filter((n) => n.type === 'tag' || (n.type === 'text' && n.data.trim().length > 0));

  for (let depth = 0; depth < 3; depth++) {
    const tagNodes = topNodes.filter((n) => n.type === 'tag');
    if (
      tagNodes.length === 1 &&
      ['div', 'main'].includes(tagNodes[0].name)
    ) {
      const innerTags = $(tagNodes[0])
        .contents()
        .toArray()
        .filter((n) => n.type === 'tag');
      if (innerTags.length >= 2) {
        wrappers.push({
          tag: tagNodes[0].name,
          attrs: tagNodes[0].attribs || {}
        });
        topNodes = $(tagNodes[0])
          .contents()
          .toArray()
          .filter((n) => n.type === 'tag' || (n.type === 'text' && n.data.trim().length > 0));
      } else if (innerTags.length === 1 && ['div', 'main'].includes(innerTags[0].name)) {
        wrappers.push({
          tag: tagNodes[0].name,
          attrs: tagNodes[0].attribs || {}
        });
        topNodes = [innerTags[0]];
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const MAX_COMPONENTS = 12;
  const groupedNodes = [];
  if (topNodes.length <= MAX_COMPONENTS) {
    for (const node of topNodes) {
      if (node.type === 'tag') groupedNodes.push(node);
    }
  } else {
    const chunkSize = Math.ceil(topNodes.length / MAX_COMPONENTS);
    for (let i = 0; i < topNodes.length; i += chunkSize) {
      const slice = topNodes.slice(i, i + chunkSize).filter((n) => n.type === 'tag');
      if (slice.length === 1) {
        groupedNodes.push(slice[0]);
      } else if (slice.length > 1) {
        const wrapper = $('<div></div>')[0];
        wrapper.children = slice;
        groupedNodes.push(wrapper);
      }
    }
  }

  const usedNames = new Set();
  const componentList = [];

  for (let i = 0; i < groupedNodes.length; i++) {
    const node = groupedNodes[i];
    const compName = inferComponentName(node, i, usedNames);
    const { code, mode } = await buildComponentFile(compName, node, $);
    const compPath = path.join(componentsDir, `${compName}.jsx`);
    await fs.writeFile(compPath, code, 'utf-8');
    componentList.push({ name: compName, file: `./components/${compName}.jsx`, mode });
  }

  let wrapperOpen = '<>';
  let wrapperClose = '</>';
  if (wrappers.length > 0) {
    wrapperOpen = wrappers
      .map((w) => {
        const classAttr = w.attrs?.class ? ` className=${JSON.stringify(w.attrs.class)}` : '';
        const idAttr = w.attrs?.id ? ` id=${JSON.stringify(w.attrs.id)}` : '';
        return `<${w.tag}${idAttr}${classAttr}>`;
      })
      .join('\n    ');
    wrapperClose = [...wrappers]
      .reverse()
      .map((w) => `</${w.tag}>`)
      .join('\n    ');
  }

  const importsCode = componentList
    .map((c) => `import ${c.name} from '${c.file}';`)
    .join('\n');
  const renderCode = componentList.map((c) => `      <${c.name} />`).join('\n');

  const appJsx = `import React from 'react';
${importsCode}

export default function App() {
  return (
    ${wrapperOpen}
${renderCode}
    ${wrapperClose}
  );
}
`;

  await fs.writeFile(path.join(srcDir, 'App.jsx'), appJsx, 'utf-8');

  const mainJsx = `import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  await fs.writeFile(path.join(srcDir, 'main.jsx'), mainJsx, 'utf-8');

  const viteCss = htmlGenResult.finalCss.replace(
    /url\(\s*(['"]?)assets\//g,
    'url($1/assets/'
  );
  await fs.writeFile(path.join(srcDir, 'styles.css'), viteCss, 'utf-8');

  const htmlClass = htmlGenResult.htmlAttrs?.class ? ` class="${htmlGenResult.htmlAttrs.class}"` : '';
  const htmlStyle = htmlGenResult.htmlAttrs?.style ? ` style="${htmlGenResult.htmlAttrs.style.replace(/"/g, '&quot;')}"` : '';
  const htmlTheme = htmlGenResult.htmlAttrs?.['data-theme'] ? ` data-theme="${htmlGenResult.htmlAttrs['data-theme']}"` : '';
  const bodyClass = htmlGenResult.bodyAttrs?.class ? ` class="${htmlGenResult.bodyAttrs.class}"` : '';
  const bodyStyle = htmlGenResult.bodyAttrs?.style ? ` style="${htmlGenResult.bodyAttrs.style.replace(/"/g, '&quot;')}"` : '';

  const reactIndexHtml = `<!DOCTYPE html>
<html lang="en"${htmlClass}${htmlTheme}${htmlStyle}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${htmlGenResult.title}</title>
  </head>
  <body${bodyClass}${bodyStyle}>
    <div id="root" style="display: contents"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
  await fs.writeFile(path.join(reactDir, 'index.html'), reactIndexHtml, 'utf-8');

  const extractedPalette = {};
  (designTokens?.colors || []).slice(0, 10).forEach((item, idx) => {
    extractedPalette[`brand-${idx + 1}`] = item.color;
  });

  const tailwindConfig = `export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: ${JSON.stringify(extractedPalette, null, 8)},
      fontFamily: {
        primary: ${JSON.stringify(designTokens?.fontFamilies?.slice(0, 2) || ['sans-serif'])}
      }
    }
  },
  plugins: []
};
`;
  await fs.writeFile(path.join(reactDir, 'tailwind.config.js'), tailwindConfig, 'utf-8');

  const reactPkgJson = {
    name: 'cloned-webapp-react',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.3.1',
      autoprefixer: '^10.4.20',
      postcss: '^8.4.47',
      tailwindcss: '^3.4.13',
      vite: '^5.4.8'
    }
  };
  await fs.writeFile(
    path.join(reactDir, 'package.json'),
    JSON.stringify(reactPkgJson, null, 2),
    'utf-8'
  );

  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
`;
  await fs.writeFile(path.join(reactDir, 'vite.config.js'), viteConfig, 'utf-8');

  return {
    reactDir,
    components: componentList
  };
}
