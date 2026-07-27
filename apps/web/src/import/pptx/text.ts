/**
 * Text escaping for imported PowerPoint content.
 *
 * Every string that comes out of a .pptx is untrusted file content and
 * lands in fields the renderer injects with `dangerouslySetInnerHTML`
 * (`content`, `caption`, `note`, table cells). `<a:t>` holds *plain*
 * text — PowerPoint stores markup as run properties, never as inline
 * tags — so anything that looks like a tag is literal text the user
 * typed and must be escaped, not passed through.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
