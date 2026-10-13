/**
 * 薪跳 SalaryDance — Host half.
 *
 * The whole feature lives in the browser entry (`./client`): an always-on
 * floating card rendered into the `shell.overlay` slot. This Host row exists so
 * the Client module is addressable from the Loader overlay and so the Plugin
 * Manager can enable, disable and describe the bundle.
 *
 * The Client plugin is registered through `dsh.client` in `package.json`; this
 * file deliberately registers nothing and has no imports, so the bundle stays
 * valid on a Host with no web carrier.
 */

/** Host plugin body. No Host-side behavior is required. */
export function apply() {}
