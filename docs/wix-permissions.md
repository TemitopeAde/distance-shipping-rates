# Wix permission scopes

Add these in the App Dashboard: `https://manage.wix.com/apps/9ae3b4e3-d854-4337-8629-031d98971a9a/home` → **Develop → Permissions → Add Permissions**. Sites that already installed the app must re-approve ("Agree & Update") before new scopes apply.

| Scope ID | Name | Why | Used by | Evidence |
| --- | --- | --- | --- | --- |
| `SCOPE.DC-DATA.READ` | Read Data Items | Read settings, locations, rules, zones, cache, logs, billing state from the app's collections | service plugin, events, API routes | skill `data-collection/WIX_DATA.md` (permissions table) |
| `SCOPE.DC-DATA.WRITE` | Write Data Items | Save configuration, cache entries, logs, usage counters, event de-duplication rows | service plugin, events, API routes | same |
| `SCOPE.DC.MANAGE-YOUR-APP` | Manage Your App | `appInstances.getAppInstance()` (billing snapshot), all `appInstances.on*` lifecycle events, `billing.getUrl()` | events, billing sync, Billing page | `@permissionScopeId` tags in `@wix/auto_sdk_app-management_*` typings; Get Url docs |
| `SCOPE.DEV_CENTER.APP-INSTANCE-READ-BASIC-INFO` | Read site, business, and email details | Listed alongside Manage Your App on the app-instance event typings | lifecycle events | `@wix/auto_sdk_app-management_app-instances` typings |
| Read Site Owner Email | Read Site Owner Email | `getAppInstance` → `site.ownerInfo`: sites whose owner has a verified `@wix.com` email get full access without a plan. Only a boolean is stored, never the email | billing sync | Get App Instance docs ("To retrieve `site.ownerInfo` … you must have the READ SITE OWNER EMAIL permission scope") |

Not required:
- **Shipping Rates service plugin**: no scope tag in the typings; the plugin is enabled by the merchant in shipping settings.
- **Stores / eCommerce read scopes**: the app uses only the data Wix passes to the plugin; it does not query products, orders or inventory.

Least privilege: the app never calls collection-management APIs, so no Data Collections management scope is requested (see skill `data-collection/LIFECYCLE.md`: item access and collection management are different scopes).
