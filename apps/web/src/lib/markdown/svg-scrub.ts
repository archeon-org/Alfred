const XLINK = 'http://www.w3.org/1999/xlink';

/** Elements that can fetch or embed foreign content; a diagram never needs them. */
const REMOVED_ELEMENTS = new Set([
  'audio',
  'base',
  'embed',
  'feimage',
  'foreignobject',
  'iframe',
  'image',
  'img',
  'link',
  'meta',
  'object',
  'script',
  'video',
]);
/** Attributes that name a resource to load. */
const REMOVED_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'data', 'ping', 'formaction']);
const EXTERNAL_CSS = /url\(|@import|expression\(|-moz-binding|behavior\s*:/iu;
/** A `url(...)` in a presentation attribute (`fill`, `filter`, `mask`…) that is not a `#local` id. */
const EXTERNAL_URL_FUNCTION = /url\(\s*['"]?\s*(?!#)/iu;

function isLocalReference(value: string | null): boolean {
  return value !== null && value.trim().startsWith('#');
}

function referenceOf(element: Element): string | null {
  return element.getAttribute('href') ?? element.getAttributeNS(XLINK, 'href');
}

/**
 * Removes from a rendered SVG everything that could reach the network or embed foreign content:
 * images and embedded documents, external `use` references, link targets, resource attributes,
 * presentation attributes pointing outside the document, inline styles and style sheets with
 * `url(...)` or `@import`. The rendering itself already ran
 * under Mermaid's strict level; this keeps a diagram from becoming a tracking pixel. Returns the
 * number of removed elements and attributes.
 */
export function scrubExternalReferences(root: Element): number {
  let removed = 0;
  const elements = [root, ...root.querySelectorAll('*')];
  for (const element of elements) {
    const name = element.localName.toLowerCase();
    if (REMOVED_ELEMENTS.has(name) || (name === 'use' && !isLocalReference(referenceOf(element)))) {
      element.remove();
      removed += 1;
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase();
      const value = attribute.value;
      const isReference = attributeName === 'href' || attributeName.endsWith(':href');
      if (
        (isReference && !isLocalReference(value)) ||
        REMOVED_ATTRIBUTES.has(attributeName) ||
        attributeName.startsWith('on') ||
        (attributeName === 'style' ? EXTERNAL_CSS.test(value) : EXTERNAL_URL_FUNCTION.test(value))
      ) {
        element.removeAttribute(attribute.name);
        removed += 1;
      }
    }
    if (name === 'style' && EXTERNAL_CSS.test(element.textContent ?? '')) {
      element.textContent = (element.textContent ?? '')
        .replaceAll(/@import[^;]*;?/giu, '')
        .replaceAll(/url\([^)]*\)/giu, 'none');
      removed += 1;
    }
  }
  return removed;
}
