"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core9 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/access.ts
var permissionNames = [
  // NKS and fleet-mandatory
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManagePayments",
  "canIssueRefunds",
  "canReadAudit",
  // Organisation
  "canManageOrganization",
  "canManageShops",
  "canManageIntegrations",
  "canAccessAllShops",
  // Policy
  "canManagePolicies",
  "canPublishPolicies",
  // Customers
  "canManageCustomers",
  "canApproveMerge",
  "canReadCustomerPII",
  // Scheduling
  "canManageSchedule",
  // Repair orders
  "canWriteRepairOrders",
  "canSendEstimates",
  "canRecordAuthorizations",
  "canApproveReopen",
  "canApproveRelease",
  "canReadRepairOrders",
  // Inspections and diagnosis
  "canPerformInspections",
  "canDiagnose",
  "canOverrideTrustGate",
  // Pricing
  "canPriceJobs",
  "canApprovePriceOverride",
  "canApproveDiscount",
  "canSeeCost",
  // Parts
  "canManageParts",
  "canOrderParts",
  "canReceiveParts",
  "canApproveSupplierInvoice",
  "canApproveStockAdjustment",
  "canApproveCoreWriteOff",
  // Labor
  "canClockSelf",
  "canManageTime",
  "canApproveTime",
  "canClosePayPeriod",
  "canReadTechPay",
  // Money
  "canFinalizeInvoices",
  "canTakePayments",
  "canCloseDay",
  "canApproveRefund",
  "canApproveWriteOff",
  "canApproveCredit",
  "canApproveCreditMemo",
  "canReadFinancials",
  // Warranty
  "canManageComebacks",
  "canApproveGoodwill",
  // Communications
  "canMessageCustomers",
  "canManageCampaigns",
  // Tires
  "canManageTireRegistrations",
  // Agents
  "canManageAgents",
  "canConfirmProposals",
  "canApproveAgentAutonomy",
  // Reporting
  "canReadReports",
  // Raw status override. Never seeded on a default role; every use is audited.
  "canBreakGlass"
];
var approvalPermissions = permissionNames.filter((name) => name.startsWith("canApprove") || name === "canPublishPolicies" || name === "canBreakGlass");
var isSignedIn = ({ session }) => {
  if (!session) return false;
  const expires = session.data?.accessExpiresAt;
  return !expires || Date.parse(expires) > Date.now();
};
var hasPermission = (session, permission) => isSignedIn({ session }) && session?.data.role?.[permission] === true;
var permissions = Object.fromEntries(
  permissionNames.map((name) => [name, ({ session }) => hasPermission(session, name)])
);
var anyOf = (...names) => ({ session }) => names.some((name) => hasPermission(session, name));
var sys = () => false;
function sessionShopIds(session) {
  if (!isSignedIn({ session })) return [];
  if (session.data.role?.canAccessAllShops) return "all";
  return (session.data.memberships ?? []).filter((m) => m.status === "active" && m.shop?.id).map((m) => m.shop.id);
}
var rules = {
  canReadPeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canSeeOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canEditOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } }
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "title", "role", "kind"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    kind: (0, import_fields2.select)({
      type: "enum",
      options: ["staff", "customer_portal", "fleet_portal", "auditor", "machine"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "staff",
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople }
    }),
    title: (0, import_fields2.text)(),
    memberships: (0, import_fields2.relationship)({ ref: "ShopMembership.user", many: true, access: { create: permissions.canManagePeople, update: permissions.canManagePeople } }),
    mfaEnrolled: (0, import_fields2.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    accessExpiresAt: (0, import_fields2.timestamp)({
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { description: "Time-boxed access for auditors and guests." }
    }),
    onboardingStatus: (0, import_fields2.select)({
      options: ["not_started", "in_progress", "completed", "dismissed"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "not_started"
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    description: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields3.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/OAuthApp.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields4.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields4.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields4.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields4.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields4.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields4.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields4.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields4.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields4.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields4.text)(),
    privacyPolicyUrl: (0, import_fields4.text)(),
    termsOfServiceUrl: (0, import_fields4.text)(),
    supportUrl: (0, import_fields4.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core5 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields5.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields5.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields5.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields5.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields5.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields5.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields5.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields5.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields5.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields5.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields5.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/platform.ts
var platform_exports = {};
__export(platform_exports, {
  AgentIdentity: () => AgentIdentity,
  ApprovalDecision: () => ApprovalDecision,
  ApprovalPolicy: () => ApprovalPolicy,
  ApprovalRequest: () => ApprovalRequest,
  AuditEvent: () => AuditEvent,
  Bay: () => Bay,
  CommandReceipt: () => CommandReceipt,
  Document: () => Document,
  Lease: () => Lease,
  MachineCredential: () => MachineCredential,
  Notification: () => Notification,
  Obligation: () => Obligation,
  OrganizationSettings: () => OrganizationSettings,
  OutboxEvent: () => OutboxEvent,
  SecretBox: () => SecretBox,
  Sequence: () => Sequence,
  Shop: () => Shop,
  ShopCalendar: () => ShopCalendar,
  ShopCalendarException: () => ShopCalendarException,
  ShopMembership: () => ShopMembership,
  WorkerSchedule: () => WorkerSchedule
});
var import_core7 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_fields6 = require("@keystone-6/core/fields");
var minor = (options = {}) => (0, import_fields6.bigInt)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var exact = (precision, scale) => (options = {}) => (0, import_fields6.decimal)({
  precision,
  scale,
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var pct = exact(12, 6);
var fac = exact(12, 6);
var conf = exact(5, 4);
var wholeNumber = (description) => (options = {}) => (0, import_fields6.integer)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0, ...options.min !== void 0 ? { min: options.min } : {} },
  ui: { description }
});
var centiHours = wholeNumber("Hundredths of an hour (125 = 1.25 h).");
var milli = wholeNumber("Thousandths of the unit (5700 = 5.7).");
var option = (value) => ({ label: value.replaceAll("_", " ").replaceAll(".", " \xB7 "), value });
var lifecycle = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  defaultValue: initial,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var choice = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  ...initial !== null ? { defaultValue: initial } : {},
  validation: { isRequired: initial !== null }
});
var versionField = () => (0, import_fields6.integer)({
  defaultValue: 0,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var systemText = (options = {}) => (0, import_fields6.text)({
  ...options.indexed ? { isIndexed: options.indexed } : {},
  validation: { isRequired: options.required ?? false },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } } };

// features/keystone/models/listAccess.ts
var rule = (permission) => permission === "signedIn" ? isSignedIn : Array.isArray(permission) ? anyOf(...permission) : permissions[permission];
var governed = (read) => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys }
});
var managed = (read, write) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys }
});
var immutable = governed;
var serverOnly = {
  operation: { query: sys, create: sys, update: sys, delete: sys }
};
function shopFilter(path = "shop") {
  return ({ session }) => {
    const ids = sessionShopIds(session);
    if (ids === "all") return true;
    const leaf = { id: { in: ids } };
    return path.split(".").reverse().reduce((inner, key) => ({ [key]: inner }), leaf);
  };
}
function shopScoped(spec, path = "shop") {
  const filter = shopFilter(path);
  return { ...spec, filter: { query: filter, update: filter, delete: filter } };
}

// features/keystone/lib/audit.ts
var import_node_crypto3 = require("node:crypto");

// features/keystone/lib/canonical.ts
var import_node_crypto2 = require("node:crypto");

// features/keystone/lib/decimal.ts
var import_decimal = __toESM(require("decimal.js"));
var Decimal = import_decimal.default.clone({
  precision: 60,
  rounding: import_decimal.default.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 60
});
var DECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
function dec(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "bigint") return new Decimal(value.toString());
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`Refusing float ${value}: pass the exact decimal as a string`);
    return new Decimal(value);
  }
  const text7 = String(value).trim();
  if (!DECIMAL_TEXT.test(text7)) throw new Error(`Not a decimal number: ${JSON.stringify(text7).slice(0, 40)}`);
  return new Decimal(text7);
}
var plain = (value) => dec(value).toFixed();
var ZERO = new Decimal(0);
var ONE = new Decimal(1);
var BPS = new Decimal(1e4);

// features/keystone/lib/canonical.ts
function canonicalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot hold a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const decimalLike = value;
    if (typeof decimalLike.isFinite === "function" && typeof decimalLike.isNaN === "function") return plain(decimalLike.toString());
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`);
}
var canonicalJson = (value) => JSON.stringify(canonicalize(value));
var sha256 = (text7) => (0, import_node_crypto2.createHash)("sha256").update(text7).digest("hex");
var payloadHash = (value) => sha256(canonicalJson(value));
var toJsonValue = (value) => canonicalize(value);

// features/keystone/lib/db.ts
async function advisoryLock(tx, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
var MODEL_NAME = /^[A-Z][A-Za-z0-9]*$/;
function tableName(model) {
  if (!MODEL_NAME.test(model)) throw new Error(`Invalid model name: ${model.slice(0, 40)}`);
  return `"${model}"`;
}
function delegateOf(tx, model) {
  tableName(model);
  const delegate = tx[model[0].toLowerCase() + model.slice(1)];
  if (!delegate) throw new Error(`Unknown model: ${model}`);
  return delegate;
}
var TRANSACTION_OPTIONS = { maxWait: 15e3, timeout: 6e4 };

// features/keystone/lib/audit.ts
var GENESIS_HASH = "0".repeat(64);
function auditHashBody(row) {
  return {
    seq: row.seq,
    eventKey: row.eventKey,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId ?? null,
    actorAgentId: row.actorAgentId ?? null,
    approverId: row.approverId ?? null,
    reason: row.reason || null,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: row.metadata ?? null,
    requestId: row.requestId || null,
    at: row.at.toISOString()
  };
}
var auditHash = (prevHash, row) => sha256(`${prevHash}
${canonicalJson(auditHashBody(row))}`);
async function appendAuditEvents(tx, events, now = /* @__PURE__ */ new Date()) {
  if (!events.length) return [];
  await advisoryLock(tx, "audit:chain");
  const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  let prevHash = last?.hash ?? GENESIS_HASH;
  const written = [];
  for (const event of events) {
    seq += 1;
    const row = {
      seq,
      eventKey: event.eventKey ?? (0, import_node_crypto3.randomUUID)(),
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      actorAgentId: event.actorAgentId ?? null,
      approverId: event.approverId ?? null,
      reason: event.reason ? event.reason.slice(0, 2e3) : null,
      before: event.before === void 0 ? null : toJsonValue(event.before),
      after: event.after === void 0 ? null : toJsonValue(event.after),
      metadata: event.metadata === void 0 ? null : toJsonValue(event.metadata),
      requestId: event.requestId ?? null,
      prevHash,
      at: now
    };
    const hash = auditHash(prevHash, row);
    const created = await tx.auditEvent.create({
      data: {
        seq: row.seq,
        eventKey: row.eventKey,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        actorUserId: row.actorUserId,
        actorAgentId: row.actorAgentId,
        approverId: row.approverId,
        reason: row.reason ?? "",
        // Nullable json columns: omit null (stored as SQL NULL, read back as null).
        ...row.before === null ? {} : { before: row.before },
        ...row.after === null ? {} : { after: row.after },
        ...row.metadata === null ? {} : { metadata: row.metadata },
        requestId: row.requestId ?? "",
        prevHash,
        hash,
        at: row.at
      },
      select: { id: true }
    });
    written.push({ id: created.id, seq, hash });
    prevHash = hash;
  }
  return written;
}
async function verifyAuditChain(db, batchSize = 1e3) {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  let count = 0;
  for (; ; ) {
    const rows = await db.auditEvent.findMany({ where: { seq: { gte: expectedSeq } }, orderBy: { seq: "asc" }, take: batchSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (row.seq !== expectedSeq) return { ok: false, count, lastSeq: expectedSeq - 1, lastHash: prevHash, brokenAtSeq: expectedSeq, problem: "missing event" };
      if (row.prevHash !== prevHash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "previous hash does not match" };
      const hash = auditHash(prevHash, {
        ...row,
        reason: row.reason || null,
        requestId: row.requestId || null,
        actorUserId: row.actorUserId ?? null,
        actorAgentId: row.actorAgentId ?? null,
        approverId: row.approverId ?? null
      });
      if (hash !== row.hash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "content does not match its hash" };
      prevHash = row.hash;
      expectedSeq += 1;
      count += 1;
    }
  }
  return { ok: true, count, lastSeq: expectedSeq - 1, lastHash: prevHash };
}

// features/keystone/models/auditHooks.ts
function auditedHooks(entityType) {
  return {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const after = operation === "delete" ? null : item;
      const before = operation === "create" ? null : originalItem;
      const id = String((item ?? originalItem)?.id ?? "");
      if (!id) return;
      const prisma = context.sudo().prisma;
      await prisma.$transaction(
        (tx) => appendAuditEvents(tx, [{
          eventType: `${entityType}.${operation}d`.replace("deleted", "deleted").replace("updated", "updated"),
          entityType,
          entityId: id,
          actorUserId: context.session?.itemId ?? null,
          before,
          after,
          metadata: { via: "admin_api" }
        }]),
        TRANSACTION_OPTIONS
      );
    }
  };
}

// features/keystone/models/platform.ts
var OrganizationSettings = (0, import_core7.list)({
  isSingleton: true,
  graphql: { plural: "OrganizationSettingsItems" },
  access: { operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageOrganization, delete: () => false } },
  hooks: auditedHooks("OrganizationSettings"),
  fields: {
    legalName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Auto Repair" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Auto Repair" }),
    currencyCode: (0, import_fields7.text)({ defaultValue: "USD", validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/, explanation: "ISO 4217 currency code" } }, ...readOnly }),
    defaultTimeZone: (0, import_fields7.text)({ defaultValue: "America/Los_Angeles", validation: { isRequired: true } }),
    customerSharing: (0, import_fields7.select)({ type: "string", options: ["shared_all_shops", "per_shop"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "shared_all_shops", validation: { isRequired: true }, ...readOnly, ui: { ...readOnly.ui, description: "Cross-shop visibility of customers. Changed through maker-checker." } }),
    retentionYearsOverride: (0, import_fields7.integer)({ ...readOnly, validation: { min: 1, max: 30 }, ui: { ...readOnly.ui, description: "Used when longer than the jurisdiction rule (CA: 4 years). Changed through maker-checker." } }),
    strictAgentOwnerSoD: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: true, ui: { ...readOnly.ui, description: "An agent's owner can't approve what the agent proposed." } }),
    version: versionField(),
    ...trackingFields
  }
});
var shopRowFilter = ({ session }) => {
  const ids = sessionShopIds(session);
  return ids === "all" ? true : { id: { in: ids } };
};
var Shop = (0, import_core7.list)({
  access: {
    operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageShops, delete: () => false },
    filter: { query: shopRowFilter, update: shopRowFilter }
  },
  hooks: auditedHooks("Shop"),
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "city", "region", "status"] } },
  fields: {
    code: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z]{2,5}$/, explanation: "2 to 5 capital letters, e.g. NGA" } } }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    legalName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    addressLine1: (0, import_fields7.text)(),
    addressLine2: (0, import_fields7.text)(),
    city: (0, import_fields7.text)(),
    region: (0, import_fields7.text)({ ui: { description: "US state code (CA). Suggests the jurisdiction pack." }, validation: { match: { regex: /^([A-Z]{2})?$/, explanation: "Two-letter state code" } } }),
    postalCode: (0, import_fields7.text)(),
    country: (0, import_fields7.text)({ defaultValue: "US" }),
    phone: (0, import_fields7.text)(),
    email: (0, import_fields7.text)(),
    website: (0, import_fields7.text)(),
    timeZone: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "America/Los_Angeles" }),
    registrations: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "{ barArd, epaId, sellerPermit, tireFeeAccount, batteryFeeAccount, other[] }: printed on estimates and invoices." } }),
    calendar: (0, import_fields7.relationship)({ ref: "ShopCalendar.shop" }),
    bays: (0, import_fields7.relationship)({ ref: "Bay.shop", many: true }),
    memberships: (0, import_fields7.relationship)({ ref: "ShopMembership.shop", many: true, ...readOnly }),
    publicProfile: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "Read by the public API only (tagline, about, hours text, amenities)." } }),
    isPublished: (0, import_fields7.checkbox)({ defaultValue: false }),
    status: lifecycle(["active", "suspended", "closed"]),
    version: versionField(),
    ...trackingFields
  }
});
var ShopMembership = (0, import_core7.list)({
  access: shopScoped(managed("canAccessDashboard", "canManagePeople")),
  hooks: auditedHooks("ShopMembership"),
  ui: { listView: { initialColumns: ["user", "shop", "role", "isDefault", "status"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.memberships" }),
    shop: (0, import_fields7.relationship)({ ref: "Shop.memberships" }),
    role: (0, import_fields7.relationship)({ ref: "Role", ui: { description: "Optional per-shop role. The user role applies when empty." } }),
    isDefault: (0, import_fields7.checkbox)({ defaultValue: false }),
    status: lifecycle(["active", "suspended", "ended"]),
    startedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    endedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var ShopCalendar = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops")),
  hooks: auditedHooks("ShopCalendar"),
  ui: { labelField: "name" },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop.calendar" }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    weeklyHours: (0, import_fields7.json)({ defaultValue: [], ui: { description: '[{ dow: 0-6 (Sunday 0), open: "07:30", close: "18:00" }] in the shop time zone.' } }),
    exceptions: (0, import_fields7.relationship)({ ref: "ShopCalendarException.calendar", many: true }),
    coverageThrough: (0, import_fields7.calendarDay)({ ui: { description: "Booking past this date is refused until the closures are reviewed." } }),
    ...trackingFields
  }
});
var ShopCalendarException = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops"), "calendar.shop"),
  hooks: auditedHooks("ShopCalendarException"),
  ui: { labelField: "date", listView: { initialColumns: ["calendar", "date", "closed", "open", "close", "reason"] } },
  fields: {
    calendar: (0, import_fields7.relationship)({ ref: "ShopCalendar.exceptions" }),
    date: (0, import_fields7.calendarDay)({ validation: { isRequired: true } }),
    closed: (0, import_fields7.checkbox)({ defaultValue: true }),
    open: (0, import_fields7.text)({ ui: { description: "HH:mm when open with special hours" } }),
    close: (0, import_fields7.text)(),
    reason: (0, import_fields7.text)(),
    ...trackingFields
  }
});
var Bay = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops")),
  hooks: auditedHooks("Bay"),
  ui: { labelField: "code", listView: { initialColumns: ["shop", "code", "name", "kind", "active"] } },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop.bays" }),
    code: (0, import_fields7.text)({ validation: { isRequired: true } }),
    name: (0, import_fields7.text)(),
    kind: choice(["general", "alignment", "lift_heavy", "quick_lube", "tire", "inspection"], "general"),
    active: (0, import_fields7.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var MachineCredential = (0, import_core7.list)({
  access: governed("canManageAgents"),
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    hashedSecret: (0, import_fields7.text)({ access: { read: () => false, create: () => false, update: () => false }, ui: { itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" } } }),
    scopes: (0, import_fields7.json)({ ...readOnly, defaultValue: [] }),
    agent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly, ui: { ...readOnly.ui, description: "Empty = all shops." } }),
    lastUsedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    revokedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var AgentIdentity = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: (0, import_fields7.select)({ type: "string", options: ["llm_agent", "voice_agent", "rules_engine", "external_mcp_client"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "llm_agent", validation: { isRequired: true }, ...readOnly }),
    modelRef: systemText(),
    owner: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    shops: (0, import_fields7.relationship)({ ref: "Shop", many: true, ...readOnly }),
    paused: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Kill switch: a paused agent can read nothing and propose nothing." } }),
    status: lifecycle(["active", "paused", "retired"]),
    oauthApp: (0, import_fields7.relationship)({ ref: "OAuthApp", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AuditEvent = (0, import_core7.list)({
  access: immutable("canReadAudit"),
  ui: { labelField: "eventType", listView: { initialColumns: ["seq", "at", "eventType", "entityType", "entityId", "actorUser"], initialSort: { field: "seq", direction: "DESC" } } },
  fields: {
    seq: (0, import_fields7.integer)({ isIndexed: "unique", validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: "unique", required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    actorAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    approver: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reason: systemText(),
    before: (0, import_fields7.json)({ ...readOnly }),
    after: (0, import_fields7.json)({ ...readOnly }),
    metadata: (0, import_fields7.json)({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: "unique", required: true }),
    at: (0, import_fields7.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, ...readOnly })
  }
});
var CommandReceipt = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields7.text)({ validation: { isRequired: true } }),
    principalKey: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestHash: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields7.json)(),
    responseCode: (0, import_fields7.text)(),
    responseBody: (0, import_fields7.json)(),
    recoveryPoint: (0, import_fields7.text)({ defaultValue: "completed" }),
    completedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});
var OutboxEvent = (0, import_core7.list)({
  access: governed("canReadAudit"),
  ui: { listView: { initialColumns: ["topic", "status", "attempts", "nextAttemptAt", "aggregateType", "aggregateId"] } },
  fields: {
    topic: systemText({ indexed: true, required: true }),
    aggregateType: systemText({ required: true }),
    aggregateId: systemText({ indexed: true, required: true }),
    dedupeKey: systemText({ indexed: "unique", required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "leased", "delivered", "failed", "dead"]),
    attempts: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    nextAttemptAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    leaseOwner: systemText(),
    leaseExpiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    lastError: systemText(),
    deliveredAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var Lease = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    owner: (0, import_fields7.text)({ validation: { isRequired: true } }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    expiresAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});
var WorkerSchedule = (0, import_core7.list)({
  access: governed("canReadAudit"),
  fields: {
    kind: systemText({ indexed: "unique", required: true }),
    intervalSeconds: (0, import_fields7.integer)({ ...readOnly }),
    nextRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    lastRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["idle", "running", "failed", "disabled"], "idle"),
    leaseKey: systemText(),
    lastError: systemText(),
    ...trackingFields
  }
});
var Sequence = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    nextValue: (0, import_fields7.integer)({ defaultValue: 1, validation: { isRequired: true } })
  }
});
var Notification = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: permissions.canAccessDashboard, delete: () => false },
    filter: {
      query: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false,
      update: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false
    }
  },
  fields: {
    recipient: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    channel: choice(["in_app", "email"], "in_app"),
    template: systemText({ required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "sent", "failed"]),
    sentAt: (0, import_fields7.timestamp)({ ...readOnly }),
    readAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var DOCUMENT_KINDS = [
  "inspection_photo",
  "inspection_video",
  "signature",
  "work_order",
  "invoice_pdf",
  "estimate_pdf",
  "call_recording",
  "transcript",
  "exemption_certificate",
  "supplier_invoice",
  "packing_slip",
  "third_party_estimate",
  "import_file",
  "export_file",
  "other"
];
var Document = (0, import_core7.list)({
  access: shopScoped(governed("canAccessDashboard")),
  ui: { labelField: "title" },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    title: systemText({ required: true }),
    kind: (0, import_fields7.select)({ type: "string", options: DOCUMENT_KINDS.map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "other", validation: { isRequired: true }, ...readOnly }),
    visibility: (0, import_fields7.select)({ type: "string", options: ["staff", "customer_link", "public"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "staff", validation: { isRequired: true }, ...readOnly }),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    bytes: (0, import_fields7.integer)({ ...readOnly }),
    documentVersion: (0, import_fields7.integer)({ defaultValue: 1, ...readOnly }),
    supersedes: (0, import_fields7.relationship)({ ref: "Document", ...readOnly }),
    retentionUntil: (0, import_fields7.calendarDay)({ ...readOnly }),
    ...trackingFields
  }
});
var Obligation = (0, import_core7.list)({
  access: shopScoped(governed("canAccessDashboard")),
  ui: { labelField: "kind", listView: { initialColumns: ["shop", "kind", "subjectType", "dueAt", "status"] } },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    kind: (0, import_fields7.select)({
      type: "string",
      options: ["tire_registration", "teardown_reassembly", "core_return", "invoice_due", "exemption_expiry", "credential_expiry", "reauthorization_wait", "retention_purge"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      validation: { isRequired: true },
      ...readOnly
    }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    dueAt: (0, import_fields7.timestamp)({ validation: { isRequired: true }, ...readOnly }),
    owner: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    ownerRole: systemText(),
    status: lifecycle(["open", "met", "waived", "breached"]),
    evidence: (0, import_fields7.json)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalPolicy = (0, import_core7.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageOrganization, update: () => false, delete: () => false } },
  ui: { labelField: "action" },
  fields: {
    action: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    description: (0, import_fields7.text)(),
    requiredPermission: (0, import_fields7.text)({ validation: { isRequired: true } }),
    minApprovals: (0, import_fields7.integer)({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: (0, import_fields7.integer)({ defaultValue: 1440 }),
    ...trackingFields
  }
});
var ApprovalRequest = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "action", listView: { initialColumns: ["action", "status", "targetList", "requestedBy", "createdAt", "expiresAt"] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    amountMinor: minor(),
    payload: (0, import_fields7.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    requestedByAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    status: lifecycle(["pending", "approved", "rejected", "expired", "cancelled"]),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    consumedAt: (0, import_fields7.timestamp)({ ...readOnly, ui: { ...readOnly.ui, description: "When the approved action was carried out. An approval is used once." } }),
    decisions: (0, import_fields7.relationship)({ ref: "ApprovalDecision.request", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalDecision = (0, import_core7.list)({
  access: immutable("canAccessDashboard"),
  fields: {
    request: (0, import_fields7.relationship)({ ref: "ApprovalRequest.decisions", ...readOnly }),
    decidedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    decision: (0, import_fields7.select)({ type: "string", options: ["approve", "reject"].map((value) => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly })
  }
});
var SecretBox = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    ciphertext: (0, import_fields7.text)({ validation: { isRequired: true } }),
    iv: (0, import_fields7.text)({ validation: { isRequired: true } }),
    authTag: (0, import_fields7.text)({ validation: { isRequired: true } }),
    keyVersion: (0, import_fields7.integer)({ defaultValue: 1 }),
    rotatedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platform_exports
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["email", "name", "password", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/op.ts
var import_graphql = require("graphql");

// features/keystone/lib/errors.ts
var DomainError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
};
var isDomainError = (error) => error instanceof DomainError;
var Codes = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  STALE_STATE: "STALE_STATE",
  GUARD_FAILED: "GUARD_FAILED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SELF_APPROVAL: "SELF_APPROVAL",
  AGENT_CANNOT_APPROVE: "AGENT_CANNOT_APPROVE",
  APPROVAL_MISMATCH: "APPROVAL_MISMATCH",
  LEASE_LOST: "LEASE_LOST",
  STALE_FENCING_TOKEN: "STALE_FENCING_TOKEN",
  AUDIT_CHAIN_BROKEN: "AUDIT_CHAIN_BROKEN",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  AGENT_FORBIDDEN_ACTION: "AGENT_FORBIDDEN_ACTION",
  AUTHORIZATION_REQUIRED: "AUTHORIZATION_REQUIRED",
  REAUTHORIZATION_REQUIRED: "REAUTHORIZATION_REQUIRED",
  DISCLOSURE_MISSING: "DISCLOSURE_MISSING",
  CONSENT_BLOCKED: "CONSENT_BLOCKED",
  CREDENTIAL_REQUIRED: "CREDENTIAL_REQUIRED",
  CREDIT_HOLD: "CREDIT_HOLD",
  PO_REQUIRED: "PO_REQUIRED",
  TIN_REQUIRED: "TIN_REQUIRED",
  TRUST_GATE: "TRUST_GATE",
  POLICY_PUBLISHED: "POLICY_PUBLISHED",
  POLICY_UNVERIFIED: "POLICY_UNVERIFIED",
  ODOMETER_REGRESSION: "ODOMETER_REGRESSION",
  CAPACITY_FULL: "CAPACITY_FULL",
  HOLD_EXPIRED: "HOLD_EXPIRED",
  OUTSIDE_HOURS: "OUTSIDE_HOURS",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE"
};

// features/keystone/mutations/op.ts
var UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
var SAFE_DETAIL_KEYS = /* @__PURE__ */ new Set(["currentStatus", "currentVersion", "to", "reason", "field", "problems", "replay"]);
var op = (fn) => async (root, args, context) => {
  try {
    return await fn(root, args, context);
  } catch (error) {
    if (error instanceof import_graphql.GraphQLError) throw error;
    if (isDomainError(error)) {
      const details = Object.fromEntries(Object.entries(error.details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)));
      throw new import_graphql.GraphQLError(error.message, { extensions: { code: error.code, ...details } });
    }
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("Operation failed:", message.slice(0, 300).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new import_graphql.GraphQLError(safe ? message : "Unable to complete the request. Please try again.", { extensions: { code: "KS_USER_INPUT_ERROR" } });
  }
};

// features/keystone/lib/actor.ts
function actorFromSession(session) {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, "Sign in to continue.");
  const role = session.data.role;
  const granted = new Set(role ? permissionNames.filter((name) => role[name] === true) : []);
  return { kind: "user", userId: session.itemId, name: session.data.name, permissions: granted };
}
function requirePermission(actor, ...anyOf2) {
  if (actor.kind === "system") return;
  if (actor.kind === "agent") throw new DomainError(Codes.NOT_AUTHORIZED, "Agents act only through their tool grants.");
  if (!anyOf2.some((permission) => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf2.join(" or ")} permission.`);
  }
}
var principalKey = (actor) => actor.kind === "user" ? `user:${actor.userId}` : actor.kind === "agent" ? `agent:${actor.agentId}` : `system:${actor.name}`;
var actorUserId = (actor) => actor.kind === "user" ? actor.userId : null;
var actorAgentId = (actor) => actor.kind === "agent" ? actor.agentId : null;

// features/keystone/lib/idempotency.ts
var IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
function assertIdempotencyKey(key) {
  if (typeof key !== "string" || !key.trim()) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, "An idempotency key is required.");
  if (!IDEMPOTENCY_KEY.test(key)) throw new DomainError(Codes.INVALID_INPUT, "The idempotency key must be 8 to 200 letters, digits or . _ : -");
}
async function claimReceipt(tx, input) {
  assertIdempotencyKey(input.key);
  await advisoryLock(tx, `command:${input.key}`);
  const existing = await tx.commandReceipt.findUnique({ where: { idempotencyKey: input.key } });
  if (!existing) return { replay: false };
  const requestHash = payloadHash(input.params);
  if (existing.command !== input.command || existing.principalKey !== input.principalKey || existing.requestHash !== requestHash) {
    throw new DomainError(Codes.IDEMPOTENCY_KEY_REUSED, "This idempotency key was already used for a different request.");
  }
  return { replay: true, responseBody: existing.responseBody };
}
async function writeReceipt(tx, input) {
  await tx.commandReceipt.create({
    data: {
      idempotencyKey: input.key,
      command: input.command,
      principalKey: input.principalKey,
      requestHash: payloadHash(input.params),
      requestParams: toJsonValue(canonicalize(input.params)),
      responseCode: "ok",
      responseBody: toJsonValue(input.response),
      recoveryPoint: "completed",
      completedAt: input.now
    }
  });
}

// features/keystone/lib/unitOfWork.ts
var UnitOfWork = class {
  constructor(tx, now, requestId) {
    this.tx = tx;
    this.now = now;
    this.requestId = requestId;
    this.audits = [];
    this.outbox = [];
  }
  audit(event) {
    this.audits.push({ requestId: this.requestId, ...event });
  }
  emit(message) {
    this.outbox.push(message);
  }
};
async function flushOutbox(tx, messages, now) {
  for (const message of messages) {
    const payload = toJsonValue(message.payload);
    const dedupeKey = message.dedupeKey ?? `${message.topic}:${message.aggregateType}:${message.aggregateId}:${sha256(canonicalJson(payload))}`;
    await tx.outboxEvent.upsert({
      where: { dedupeKey },
      create: {
        topic: message.topic,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        dedupeKey,
        payload,
        status: "pending",
        nextAttemptAt: message.availableAt ?? now
      },
      update: {}
    });
  }
}
async function runInTransaction(db, work, options = {}) {
  return db.$transaction(async (tx) => {
    if (options.actorKind) await tx.$executeRaw`SELECT set_config('app.actor_kind', ${options.actorKind}, true)`;
    const uow = new UnitOfWork(tx, options.now ?? /* @__PURE__ */ new Date(), options.requestId ?? null);
    const result = await work(uow);
    await flushOutbox(tx, uow.outbox, uow.now);
    await appendAuditEvents(tx, uow.audits, uow.now);
    return result;
  }, TRANSACTION_OPTIONS);
}

// features/keystone/lib/command.ts
var RETRYABLE = /deadlock detected|could not serialize|P2034|40P01|40001/i;
async function command(db, spec, work) {
  const principal = principalKey(spec.actor);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runInTransaction(db, async (uow) => {
        const receipt = await claimReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params });
        if (receipt.replay) return { replay: true, value: receipt.responseBody };
        const value = toJsonValue(await work(uow));
        await writeReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params, response: value, now: uow.now });
        return { replay: false, value };
      }, { requestId: spec.requestId ?? null, now: spec.now, actorKind: spec.actor.kind });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code ?? "";
      if (attempt < 4 && (RETRYABLE.test(message) || RETRYABLE.test(code))) continue;
      throw error;
    }
  }
}

// features/keystone/lib/cas.ts
var COLUMN = /^[a-z][A-Za-z0-9]*$/;
async function lockRow(tx, model, id) {
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM ${tableName(model)} WHERE id = $1 FOR UPDATE`, id);
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `${model} not found.`, { model, id });
  const row = await delegateOf(tx, model).findUnique({ where: { id } });
  return row;
}
async function transition(uow, spec) {
  const statusField = spec.statusField ?? "status";
  if (!COLUMN.test(statusField)) throw new Error("Invalid status field");
  const row = await lockRow(uow.tx, spec.model, spec.id);
  const currentStatus = String(row[statusField]);
  const currentVersion = Number(row.version);
  if (spec.expectedVersion !== void 0 && spec.expectedVersion !== null && spec.expectedVersion !== currentVersion) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  if (!spec.from.includes(currentStatus)) {
    throw new DomainError(Codes.INVALID_TRANSITION, `${spec.model} can't move from ${currentStatus} to ${spec.to}.`, { currentStatus, currentVersion, to: spec.to });
  }
  if (spec.guard) await spec.guard(row);
  const extra = typeof spec.data === "function" ? await spec.data(row) : spec.data ?? {};
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, version: currentVersion, [statusField]: { in: [...spec.from] } },
    data: { ...extra, [statusField]: spec.to, version: { increment: 1 } }
  });
  if (result.count !== 1) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  uow.audit({
    eventType: spec.eventType,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorAgentId: actorAgentId(spec.actor),
    approverId: spec.approverId ?? null,
    reason: spec.reason ?? null,
    before: { [statusField]: currentStatus, version: currentVersion },
    after: { [statusField]: spec.to, version: currentVersion + 1, ...extra },
    metadata: { ...spec.metadata ?? {}, ...spec.actor.kind === "system" ? { system: spec.actor.name } : {} }
  });
  return await delegateOf(uow.tx, spec.model).findUnique({ where: { id: spec.id } });
}
function auditCreate(uow, actor, model, id, eventType, after, extra = {}) {
  uow.audit({
    eventType,
    entityType: model,
    entityId: id,
    actorUserId: actorUserId(actor),
    actorAgentId: actorAgentId(actor),
    reason: extra.reason ?? null,
    after,
    metadata: { ...extra.metadata ?? {}, ...actor.kind === "system" ? { system: actor.name } : {} }
  });
}

// features/keystone/seed/northgate.ts
var ORG = {
  legalName: "Northgate Auto Group LLC",
  displayName: "Northgate Auto Group",
  defaultTimeZone: "America/Los_Angeles"
};
var WEEKDAY = (open, close, saturday) => [
  ...[1, 2, 3, 4, 5].map((dow) => ({ dow, open, close })),
  ...saturday ? [{ dow: 6, open: saturday[0], close: saturday[1] }] : []
];
var SHOPS = [
  {
    id: "seed_shop_nga",
    code: "NGA",
    name: "Northgate Auto Care",
    legalName: "Northgate Auto Group LLC",
    addressLine1: "2215 Northgate Blvd",
    city: "Sacramento",
    region: "CA",
    postalCode: "95833",
    phone: "+19165550142",
    email: "service@northgate-auto.example",
    registrations: { barArd: "ARD-000000", epaId: "CAR000000000", sellerPermit: "SR-XX-000-000000", tireFeeAccount: "TF-000000" },
    weeklyHours: WEEKDAY("07:30", "18:00", ["08:00", "14:00"]),
    bays: [
      ...Array.from({ length: 6 }, (_, i) => ({ code: `B${i + 1}`, name: `Bay ${i + 1}`, kind: "general" })),
      { code: "B7", name: "Bay 7 (heavy lift)", kind: "lift_heavy" },
      { code: "AL1", name: "Alignment", kind: "alignment" }
    ]
  },
  {
    id: "seed_shop_ngt",
    code: "NGT",
    name: "Northgate Tire & Lube",
    legalName: "Northgate Auto Group LLC",
    addressLine1: "480 Galleria Way",
    city: "Roseville",
    region: "CA",
    postalCode: "95678",
    phone: "+19165550178",
    email: "roseville@northgate-auto.example",
    registrations: { barArd: "ARD-000001", epaId: "CAR000000001", sellerPermit: "SR-XX-000-000001", tireFeeAccount: "TF-000001" },
    weeklyHours: WEEKDAY("08:00", "18:00", ["08:00", "16:00"]),
    bays: [
      { code: "T1", name: "Tire bay 1", kind: "tire" },
      { code: "T2", name: "Tire bay 2", kind: "tire" },
      { code: "AL1", name: "Alignment", kind: "alignment" },
      { code: "QL1", name: "Quick lube 1", kind: "quick_lube" },
      { code: "QL2", name: "Quick lube 2", kind: "quick_lube" }
    ]
  }
];
var SHOP_CLOSURES = [
  ["2026-11-26", "Thanksgiving"],
  ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"],
  ["2027-05-31", "Memorial Day"],
  ["2027-07-05", "Independence Day (observed)"],
  ["2027-09-06", "Labor Day"],
  ["2027-11-25", "Thanksgiving"],
  ["2027-12-24", "Christmas Eve"],
  ["2027-12-31", "New Year's Eve"]
];
var CALENDAR_COVERAGE_THROUGH = "2027-12-31";
var STAFF_BASE = ["canAccessDashboard", "canSeeOtherPeople", "canReadRepairOrders"];
var COUNTER = ["canManageCustomers", "canReadCustomerPII", "canManageSchedule", "canWriteRepairOrders", "canSendEstimates", "canRecordAuthorizations", "canPriceJobs", "canFinalizeInvoices", "canTakePayments", "canCloseDay", "canMessageCustomers", "canManageTireRegistrations"];
var ROLES = [
  {
    id: "seed_role_owner",
    name: "Owner",
    description: "Everything in the organisation, including approvals of last resort.",
    permissions: [
      ...STAFF_BASE,
      ...COUNTER,
      "canEditOtherPeople",
      "canManagePeople",
      "canManageRoles",
      "canManageOnboarding",
      "canManagePayments",
      "canIssueRefunds",
      "canReadAudit",
      "canManageOrganization",
      "canManageShops",
      "canManageIntegrations",
      "canAccessAllShops",
      "canManagePolicies",
      "canPublishPolicies",
      "canApproveMerge",
      "canApproveReopen",
      "canApproveRelease",
      "canPerformInspections",
      "canDiagnose",
      "canOverrideTrustGate",
      "canApprovePriceOverride",
      "canApproveDiscount",
      "canSeeCost",
      "canManageParts",
      "canOrderParts",
      "canReceiveParts",
      "canApproveSupplierInvoice",
      "canApproveStockAdjustment",
      "canApproveCoreWriteOff",
      "canManageTime",
      "canApproveTime",
      "canClosePayPeriod",
      "canReadTechPay",
      "canApproveRefund",
      "canApproveWriteOff",
      "canApproveCredit",
      "canApproveCreditMemo",
      "canReadFinancials",
      "canManageComebacks",
      "canApproveGoodwill",
      "canManageCampaigns",
      "canManageAgents",
      "canConfirmProposals",
      "canApproveAgentAutonomy",
      "canReadReports"
    ]
  },
  {
    id: "seed_role_manager",
    name: "Shop Manager",
    description: "Runs a shop: drafts policy, approves discounts, overrides, write-offs and time.",
    permissions: [
      ...STAFF_BASE,
      ...COUNTER,
      "canManagePeople",
      "canIssueRefunds",
      "canReadAudit",
      "canManageShops",
      "canManagePolicies",
      "canApproveMerge",
      "canApproveReopen",
      "canApproveRelease",
      "canOverrideTrustGate",
      "canApprovePriceOverride",
      "canApproveDiscount",
      "canSeeCost",
      "canManageParts",
      "canOrderParts",
      "canApproveSupplierInvoice",
      "canApproveStockAdjustment",
      "canApproveCoreWriteOff",
      "canManageTime",
      "canApproveTime",
      "canClosePayPeriod",
      "canReadTechPay",
      "canApproveRefund",
      "canApproveWriteOff",
      "canApproveCredit",
      "canApproveCreditMemo",
      "canReadFinancials",
      "canManageComebacks",
      "canApproveGoodwill",
      "canManageAgents",
      "canConfirmProposals",
      "canReadReports"
    ]
  },
  { id: "seed_role_advisor", name: "Service Advisor", description: "Front counter: customers, appointments, ROs, estimates, authorizations, invoices and payments. No cost view.", permissions: [...STAFF_BASE, ...COUNTER, "canConfirmProposals", "canReadReports"] },
  { id: "seed_role_lead_tech", name: "Lead Technician", description: "Dispatch, quality checks and the team clocks.", permissions: [...STAFF_BASE, "canPerformInspections", "canDiagnose", "canClockSelf", "canManageTime", "canWriteRepairOrders", "canReadReports"] },
  { id: "seed_role_tech", name: "Technician", description: "Assigned jobs, inspections, diagnosis and own clocks. No customer financials.", permissions: ["canAccessDashboard", "canReadRepairOrders", "canPerformInspections", "canDiagnose", "canClockSelf"] },
  { id: "seed_role_parts", name: "Parts Manager", description: "Suppliers, quotes, orders, receiving, stock, cores and supplier invoices.", permissions: [...STAFF_BASE, "canManageParts", "canOrderParts", "canReceiveParts", "canSeeCost", "canManageTireRegistrations", "canReadReports"] },
  { id: "seed_role_bookkeeper", name: "Bookkeeper", description: "Payments, AR, statements, day close and accounting exports.", permissions: [...STAFF_BASE, "canTakePayments", "canCloseDay", "canFinalizeInvoices", "canReadFinancials", "canSeeCost", "canReadTechPay", "canManagePayments", "canReadCustomerPII", "canReadReports"] },
  { id: "seed_role_marketing", name: "Marketing", description: "Templates, consent-gated campaigns and reviews. No RO edits.", permissions: ["canAccessDashboard", "canManageCampaigns", "canMessageCustomers", "canReadReports"] },
  { id: "seed_role_auditor", name: "Auditor", description: "Read-only and time-boxed by the user access expiry.", permissions: [...STAFF_BASE, "canReadAudit", "canReadFinancials", "canReadCustomerPII", "canReadReports", "canAccessAllShops"] },
  { id: "seed_role_portal", name: "Customer Portal", description: "Storefront API session only; no dashboard.", permissions: [], dashboard: false },
  { id: "seed_role_fleet", name: "Fleet Approver", description: "Fleet portal API session only; no dashboard.", permissions: [], dashboard: false }
];
var shopBoth = ["seed_shop_nga", "seed_shop_ngt"];
var email = (local) => `${local}@northgate-auto.example`;
var STAFF = [
  { id: "seed_user_whitfield", name: "Dana Whitfield", email: email("dana.whitfield"), title: "Owner", roleId: "seed_role_owner", kind: "staff", shops: shopBoth },
  { id: "seed_user_ortega", name: "Marcus Ortega", email: email("marcus.ortega"), title: "Shop Manager, Northgate Auto Care", roleId: "seed_role_manager", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_shah", name: "Priya Shah", email: email("priya.shah"), title: "Service Advisor", roleId: "seed_role_advisor", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_becker", name: "Tom Becker", email: email("tom.becker"), title: "Service Advisor", roleId: "seed_role_advisor", kind: "staff", shops: ["seed_shop_ngt"] },
  { id: "seed_user_ramirez", name: "Luis Ramirez", email: email("luis.ramirez"), title: "Lead Technician (ASE A1-A8, EPA 609)", roleId: "seed_role_lead_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_tran", name: "Kevin Tran", email: email("kevin.tran"), title: "Technician", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_morgan", name: "Aisha Morgan", email: email("aisha.morgan"), title: "Technician", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_ngt"] },
  { id: "seed_user_holloway", name: "Jake Holloway", email: email("jake.holloway"), title: "Technician (EPA 609 expired)", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_delgado", name: "Rosa Delgado", email: email("rosa.delgado"), title: "Parts Manager", roleId: "seed_role_parts", kind: "staff", shops: shopBoth },
  { id: "seed_user_park", name: "Helen Park", email: email("helen.park"), title: "Bookkeeper", roleId: "seed_role_bookkeeper", kind: "staff", shops: shopBoth },
  { id: "seed_user_ito", name: "Sam Ito", email: email("sam.ito"), title: "Marketing", roleId: "seed_role_marketing", kind: "staff", shops: shopBoth },
  { id: "seed_user_auditor", name: "L. Navarro", email: "l.navarro@navarro-cpa.example", title: "CPA, Navarro & Co (guest)", roleId: "seed_role_auditor", kind: "auditor", shops: [], accessDays: 30 }
];
var AGENTS = [
  { id: "seed_agent_front_desk", name: "Front Desk Assistant", kind: "llm_agent", ownerId: "seed_user_ortega", shops: shopBoth },
  { id: "seed_agent_parts_runner", name: "Parts Runner", kind: "llm_agent", ownerId: "seed_user_delgado", shops: shopBoth },
  { id: "seed_agent_diag_helper", name: "Diag Helper", kind: "llm_agent", ownerId: "seed_user_ramirez", shops: ["seed_shop_nga"] }
];
var APPROVAL_POLICIES = [
  { action: "policy.publish", description: "Publish a policy version (jurisdiction, labor, parts, fees, tax, warranty, shop policy).", requiredPermission: "canPublishPolicies", expiresAfterMinutes: 3 * 1440 },
  { action: "customer.merge", description: "Merge two customer records.", requiredPermission: "canApproveMerge", expiresAfterMinutes: 1440 },
  { action: "ro.reopen", description: "Reopen an invoiced or closed repair order.", requiredPermission: "canApproveReopen", expiresAfterMinutes: 240 },
  { action: "vehicle.release_with_balance", description: "Release a vehicle with an unpaid balance.", requiredPermission: "canApproveRelease", expiresAfterMinutes: 240 },
  { action: "price.override", description: "Price a line below the margin floor.", requiredPermission: "canApprovePriceOverride", expiresAfterMinutes: 240 },
  { action: "discount.over_limit", description: "Discount above the requester's role limit.", requiredPermission: "canApproveDiscount", expiresAfterMinutes: 240 },
  { action: "trust_gate.override", description: "Send a diagnosis-based job below the confidence threshold.", requiredPermission: "canOverrideTrustGate", expiresAfterMinutes: 240 },
  { action: "supplier_invoice.approve", description: "Approve a supplier invoice for payment.", requiredPermission: "canApproveSupplierInvoice", expiresAfterMinutes: 3 * 1440 },
  { action: "stock.adjust", description: "Post a cycle-count variance or stock adjustment.", requiredPermission: "canApproveStockAdjustment", expiresAfterMinutes: 1440 },
  { action: "core.write_off", description: "Write off an uncredited core.", requiredPermission: "canApproveCoreWriteOff", expiresAfterMinutes: 1440 },
  { action: "time.correction", description: "Correct a clock entry.", requiredPermission: "canApproveTime", expiresAfterMinutes: 3 * 1440 },
  { action: "pay_period.close", description: "Close a pay period.", requiredPermission: "canClosePayPeriod", expiresAfterMinutes: 1440 },
  { action: "refund.issue", description: "Refund a customer payment.", requiredPermission: "canApproveRefund", expiresAfterMinutes: 240, thresholdMinor: 0n },
  { action: "invoice.write_off", description: "Write off an invoice balance.", requiredPermission: "canApproveWriteOff", expiresAfterMinutes: 1440 },
  { action: "credit_memo.issue", description: "Issue a credit memo above the threshold.", requiredPermission: "canApproveCreditMemo", expiresAfterMinutes: 1440, thresholdMinor: 5000n },
  { action: "account.credit_hold_release", description: "Release a business account from credit hold or extend credit.", requiredPermission: "canApproveCredit", expiresAfterMinutes: 1440 },
  { action: "day.reopen", description: "Reopen a closed business day.", requiredPermission: "canApproveRefund", expiresAfterMinutes: 240 },
  { action: "goodwill.approve", description: "No-charge comeback outside coverage.", requiredPermission: "canApproveGoodwill", expiresAfterMinutes: 1440 },
  { action: "agent_grant.activate", description: "Activate a tool grant for an AI agent.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "agent.autonomy", description: "Change agent autonomy for an action class.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "org.controls", description: "Change organisation-wide agent controls.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "role.assign_approval", description: "Give a person a role that can approve.", requiredPermission: "canManageRoles", expiresAfterMinutes: 1440 }
];

// features/keystone/seed/platform.ts
var UNUSABLE_PASSWORD_HASH = "$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya";
var day = (date) => /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
async function seedOrgPlatform(uow, actor) {
  const { tx, now } = uow;
  const created = { organization: 0, shops: 0, bays: 0, calendarExceptions: 0, roles: 0, staff: 0, memberships: 0, agents: 0, approvalPolicies: 0 };
  if (!await tx.organizationSettings.findUnique({ where: { id: 1 } })) {
    await tx.organizationSettings.create({ data: { id: 1, ...ORG } });
    auditCreate(uow, actor, "OrganizationSettings", "1", "organization.created", ORG, { metadata: { seed: true } });
    created.organization += 1;
  }
  for (const shop of SHOPS) {
    if (await tx.shop.findFirst({ where: { OR: [{ id: shop.id }, { code: shop.code }] } })) continue;
    const { bays, weeklyHours, ...fields } = shop;
    const calendar = await tx.shopCalendar.create({
      data: { id: `${shop.id}_calendar`, name: `${shop.name} hours`, weeklyHours, coverageThrough: day(CALENDAR_COVERAGE_THROUGH) }
    });
    await tx.shop.create({ data: { ...fields, registrations: fields.registrations, timeZone: ORG.defaultTimeZone, isPublished: false, calendarId: calendar.id } });
    await tx.shopCalendarException.createMany({ data: SHOP_CLOSURES.map(([date, reason]) => ({ calendarId: calendar.id, date: day(date), closed: true, reason })) });
    await tx.bay.createMany({ data: bays.map((bay) => ({ id: `${shop.id}_${bay.code.toLowerCase()}`, shopId: shop.id, code: bay.code, name: bay.name, kind: bay.kind, active: true })) });
    auditCreate(uow, actor, "Shop", shop.id, "shop.created", { code: shop.code, name: shop.name, bays: bays.length, region: shop.region }, { metadata: { seed: true } });
    created.shops += 1;
    created.bays += bays.length;
    created.calendarExceptions += SHOP_CLOSURES.length;
  }
  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const newRoles = ROLES.filter((role) => !haveRoles.has(role.id));
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map((role) => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map((name) => [name, role.permissions.includes(name)])) })) });
    for (const role of newRoles) auditCreate(uow, actor, "Role", role.id, "role.created", { name: role.name, permissions: role.permissions }, { metadata: { seed: true } });
    created.roles = newRoles.length;
  }
  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map((p) => p.id) } }, { email: { in: STAFF.map((p) => p.email) } }] }, select: { id: true, email: true } });
  const newStaff = STAFF.filter((person) => !haveUsers.some((u) => u.id === person.id || u.email === person.email));
  if (newStaff.length) {
    await tx.user.createMany({
      data: newStaff.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        password: UNUSABLE_PASSWORD_HASH,
        kind: person.kind,
        roleId: person.roleId,
        accessExpiresAt: person.accessDays ? new Date(now.getTime() + person.accessDays * 864e5) : null,
        onboardingStatus: "dismissed"
      }))
    });
    for (const person of newStaff) auditCreate(uow, actor, "User", person.id, "user.created", { name: person.name, title: person.title, role: person.roleId, kind: person.kind, shops: person.shops }, { metadata: { seed: true } });
    created.staff = newStaff.length;
    const memberships = newStaff.flatMap((person) => person.shops.map((shopId, i) => ({ id: `${person.id}_${shopId}`, userId: person.id, shopId, isDefault: i === 0, status: "active", startedAt: now })));
    if (memberships.length) {
      await tx.shopMembership.createMany({ data: memberships });
      created.memberships = memberships.length;
    }
  }
  for (const agent of AGENTS) {
    if (await tx.agentIdentity.findFirst({ where: { OR: [{ id: agent.id }, { name: agent.name }] } })) continue;
    await tx.agentIdentity.create({ data: { id: agent.id, name: agent.name, kind: agent.kind, ownerId: agent.ownerId, status: "active", shops: { connect: agent.shops.map((id) => ({ id })) } } });
    auditCreate(uow, actor, "AgentIdentity", agent.id, "agent.created", { name: agent.name, owner: agent.ownerId, autonomy: "propose_only" }, { metadata: { seed: true } });
    created.agents += 1;
  }
  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map((p) => p.action));
  for (const policy of APPROVAL_POLICIES.filter((p) => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } });
    auditCreate(uow, actor, "ApprovalPolicy", row.id, "approval_policy.created", { action: policy.action, requiredPermission: policy.requiredPermission }, { metadata: { seed: true } });
    created.approvalPolicies += 1;
  }
  return created;
}

// features/keystone/mutations/setup.ts
async function loadNorthgateSetup(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOnboarding");
  const result = await command(context.prisma, { name: "setup.load_northgate", actor, idempotencyKey: args.idempotencyKey, params: {} }, (uow) => seedOrgPlatform(uow, actor));
  return { replay: result.replay, created: result.value };
}

// features/keystone/mutations/audit.ts
async function verifyAuditChain2(_root, _args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadAudit");
  return verifyAuditChain(context.prisma);
}

// features/keystone/lib/separationOfDuties.ts
var SELF_APPROVAL_MESSAGE = "You can't approve your own request.";
var AGENT_APPROVAL_MESSAGE = "An agent can propose but never approve.";
function assertCanDecide(actor, requesterUserId, requesterAgentOwnerId, strictAgentOwner = true) {
  if (actor.kind !== "user") throw new DomainError(Codes.AGENT_CANNOT_APPROVE, AGENT_APPROVAL_MESSAGE);
  if (requesterUserId && requesterUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, SELF_APPROVAL_MESSAGE);
  if (strictAgentOwner && requesterAgentOwnerId && requesterAgentOwnerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a proposal made by your own agent.");
}

// features/keystone/lib/approval.ts
async function requestApproval(uow, actor, input) {
  const policy = await uow.tx.approvalPolicy.findUnique({ where: { action: input.action } });
  const requiredPermission = policy?.requiredPermission ?? input.requiredPermission;
  const minutes = input.expiresInMinutes ?? policy?.expiresAfterMinutes ?? 1440;
  const created = await uow.tx.approvalRequest.create({
    data: {
      action: input.action,
      summary: input.summary ?? "",
      targetList: input.targetList,
      targetId: input.targetId,
      payload: toJsonValue(input.payload),
      payloadHash: payloadHash(input.payload),
      requiredPermission,
      requestedById: actorUserId(actor),
      requestedByAgentId: actorAgentId(actor),
      status: "pending",
      expiresAt: new Date(uow.now.getTime() + minutes * 6e4)
    }
  });
  uow.audit({ eventType: "approval.requested", entityType: "ApprovalRequest", entityId: created.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { action: input.action, targetList: input.targetList, targetId: input.targetId, payloadHash: created.payloadHash, requiredPermission } });
  uow.emit({ topic: "notify.approval", aggregateType: "ApprovalRequest", aggregateId: created.id, payload: { action: input.action, requiredPermission }, dedupeKey: `notify.approval:${created.id}` });
  return created;
}
async function decideApproval(uow, actor, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  let agentOwnerId = null;
  if (request.requestedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: request.requestedByAgentId }, select: { ownerId: true } });
    agentOwnerId = agent?.ownerId ?? null;
  }
  assertCanDecide(actor, request.requestedById, agentOwnerId, input.strictAgentOwner ?? true);
  if (actor.kind !== "user" || !actor.permissions.has(request.requiredPermission)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${request.requiredPermission} permission.`);
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) {
    await transition(uow, { model: "ApprovalRequest", id: input.requestId, from: ["pending"], to: "expired", actor, eventType: "approval.expired" });
    throw new DomainError(Codes.GUARD_FAILED, "This approval request has expired.");
  }
  const to = input.decision === "approve" ? "approved" : "rejected";
  const updated = await transition(uow, {
    model: "ApprovalRequest",
    id: input.requestId,
    from: ["pending"],
    to,
    expectedVersion: input.expectedVersion,
    actor,
    eventType: `approval.${to}`,
    reason: input.reason ?? null,
    approverId: actor.userId
  });
  await uow.tx.approvalDecision.create({ data: { requestId: input.requestId, decidedById: actor.userId, decision: input.decision, reason: input.reason ?? "", at: uow.now } });
  return updated;
}
async function consumeApproval(uow, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  if (request.status !== "approved") throw new DomainError(Codes.APPROVAL_REQUIRED, "This action needs an approved request.");
  if (request.consumedAt) throw new DomainError(Codes.APPROVAL_MISMATCH, "This approval was already used.");
  if (request.action !== input.action || request.targetList !== input.targetList || request.targetId !== input.targetId || request.payloadHash !== payloadHash(input.payload)) {
    throw new DomainError(Codes.APPROVAL_MISMATCH, "The approval was given for a different action or payload.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The approval has expired.");
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: input.requestId, decision: "approve" }, orderBy: { at: "desc" } });
  await uow.tx.approvalRequest.update({ where: { id: input.requestId }, data: { consumedAt: uow.now, version: { increment: 1 } } });
  uow.audit({ eventType: "approval.consumed", entityType: "ApprovalRequest", entityId: input.requestId, approverId: decision?.decidedById ?? null, after: { action: input.action, targetId: input.targetId } });
  return { approverId: decision?.decidedById ?? null };
}

// features/keystone/lib/approvalAppliers.ts
var appliers = /* @__PURE__ */ new Map();
function registerApplier(action, apply, options = {}) {
  if (appliers.has(action)) throw new Error(`Applier for ${action} already registered`);
  appliers.set(action, { apply, applyOnApprove: options.applyOnApprove ?? true });
}
function applierFor(action) {
  return appliers.get(action) ?? null;
}

// features/keystone/lib/orgControls.ts
var KEYS = ["strictAgentOwnerSoD", "customerSharing", "retentionYearsOverride"];
function validateOrgControls(input) {
  const keys = Object.keys(input ?? {});
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to change.");
  const out = {};
  for (const key of keys) if (!KEYS.includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not an organisation control.`, { field: key });
  if (input.strictAgentOwnerSoD !== void 0) {
    if (typeof input.strictAgentOwnerSoD !== "boolean") throw new DomainError(Codes.INVALID_INPUT, "strictAgentOwnerSoD must be true or false.");
    out.strictAgentOwnerSoD = input.strictAgentOwnerSoD;
  }
  if (input.customerSharing !== void 0) {
    if (input.customerSharing !== "shared_all_shops" && input.customerSharing !== "per_shop") throw new DomainError(Codes.INVALID_INPUT, "customerSharing must be shared_all_shops or per_shop.", { field: "customerSharing" });
    out.customerSharing = input.customerSharing;
  }
  if (input.retentionYearsOverride !== void 0) {
    const years = input.retentionYearsOverride;
    if (years !== null && (!Number.isSafeInteger(years) || years < 1 || years > 30)) throw new DomainError(Codes.INVALID_INPUT, "retentionYearsOverride must be a whole number of years from 1 to 30, or empty.", { field: "retentionYearsOverride" });
    out.retentionYearsOverride = years;
  }
  return out;
}
async function requestOrgControlsChange(uow, actor, input, reason) {
  const changes = validateOrgControls(input);
  const org = await uow.tx.organizationSettings.findUnique({ where: { id: 1 } });
  if (!org) throw new DomainError(Codes.NOT_FOUND, "Organisation settings are not set up yet.");
  return requestApproval(uow, actor, {
    action: "org.controls",
    targetList: "OrganizationSettings",
    targetId: "1",
    payload: { changes, baseVersion: org.version },
    requiredPermission: "canApproveAgentAutonomy",
    summary: `Change organisation controls: ${Object.keys(changes).join(", ")}${reason ? ` (${reason})` : ""}`
  });
}
registerApplier("org.controls", async (uow, actor, request) => {
  const [org] = await uow.tx.$queryRaw`SELECT version FROM "OrganizationSettings" WHERE id = 1 FOR UPDATE`;
  if (!org) throw new DomainError(Codes.NOT_FOUND, "Organisation settings are not set up yet.");
  const { changes, baseVersion } = request.payload;
  if (org.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, "Organisation settings changed after this was approved. Request the change again.", { currentVersion: org.version });
  const before = await uow.tx.organizationSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true, customerSharing: true, retentionYearsOverride: true } });
  const updated = await uow.tx.organizationSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "Organisation settings changed while applying.");
  uow.audit({ eventType: "org.controls_changed", entityType: "OrganizationSettings", entityId: "1", actorUserId: actor.kind === "user" ? actor.userId : null, before, after: changes });
  return { applied: Object.keys(changes) };
});

// features/keystone/mutations/approvals.ts
async function decideApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  if (args.decision !== "approve" && args.decision !== "reject") throw new DomainError(Codes.INVALID_INPUT, "Decision must be approve or reject.");
  if (args.decision === "reject" && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why you are rejecting it.", { field: "reason" });
  const result = await command(context.prisma, { name: "approval.decide", actor, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? "", expectedVersion: args.expectedVersion } }, async (uow) => {
    const org = await uow.tx.organizationSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } });
    const decided = await decideApproval(uow, actor, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? void 0, expectedVersion: args.expectedVersion, strictAgentOwner: org?.strictAgentOwnerSoD ?? true });
    let applied = null;
    const registration = applierFor(String(decided.action));
    if (args.decision === "approve" && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload });
      applied = await registration.apply(uow, actor, request);
    }
    return { id: decided.id, status: decided.status, applied };
  });
  return { replay: result.replay, ...result.value };
}
async function cancelApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  const result = await command(context.prisma, { name: "approval.cancel", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const row = await transition(uow, {
      model: "ApprovalRequest",
      id: args.requestId,
      from: ["pending"],
      to: "cancelled",
      expectedVersion: args.expectedVersion,
      actor,
      eventType: "approval.cancelled",
      reason: args.reason ?? null,
      guard: (request) => {
        if (actor.kind !== "user" || request.requestedById !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the person who asked can withdraw a request.");
      }
    });
    return { id: row.id, status: row.status };
  });
  return { replay: result.replay, ...result.value };
}
async function requestOrgControls(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOrganization", "canManageAgents");
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the controls should change.", { field: "reason" });
  const result = await command(context.prisma, { name: "org.controls.request", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const request = await requestOrgControlsChange(uow, actor, args.changes, args.reason.trim());
    return { id: request.id, status: request.status };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadNorthgateSetup(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOrgControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        verifyAuditChain: op(verifyAuditChain2)
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        loadNorthgateSetup: op(loadNorthgateSetup),
        decideApprovalRequest: op(decideApprovalRequest),
        cancelApprovalRequest: op(cancelApprovalRequest),
        requestOrgControls: op(requestOrgControls)
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/prismaConstraints.ts
var COMPOUND_UNIQUES = {
  ShopCalendarException: ['@@unique([calendarId, date], map: "ShopCalendarException_calendar_date_key")'],
  ShopMembership: ['@@unique([userId, shopId], map: "ShopMembership_user_shop_key")'],
  Bay: ['@@unique([shopId, code], map: "Bay_shop_code_key")']
};
function addDatabaseConstraints(schema) {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
    const model = schema.match(pattern)?.[0];
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`);
    const missing = directives.filter((directive) => !model.includes(directive));
    if (!missing.length) continue;
    schema = schema.replace(model, model.replace(/\n\}$/, `
${missing.map((directive) => `  ${directive}`).join("\n")}
}`));
  }
  return schema;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Owner / Admin",
          // Every permission except break-glass, which is never granted by default.
          ...Object.fromEntries(permissionNames.filter((name) => name !== "canBreakGlass").map((name) => [name, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    kind
    accessExpiresAt
    role {
      id
      name
      ${permissionNames.join("\n      ")}
    }
    memberships(where: { status: { equals: "active" } }) {
      status
      shop { id }
    }
  `
});
var keystone_default = withAuth(
  (0, import_core9.config)({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => isSignedIn({ session }) && session?.data.role?.canAccessDashboard === true
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
