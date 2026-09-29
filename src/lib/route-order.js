// Dashboard folders may start with a number to set their sidebar order: routes/dashboard/2-account.
// The number is only for ordering; it never appears in URLs, labels or icon names.
// Used by src/hooks.js (URLs) and routes/dashboard/+layout.server.js (sidebar).

// '/dashboard/2-account/1-settings' -> '/dashboard/account/settings'
export const withoutOrder = (path) => path.replace(/(^|\/)\d+-/g, '$1');
