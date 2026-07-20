const client = ZAFClient.init();

/**
 * Zendesk custom-field configuration.
 *
 * Replace 123456789 with the numeric ID shown in:
 * Zendesk Admin Centre → Objects and rules → Tickets → Fields
 *
 * The dropdown option tags should be:
 *
 * found
 * not_found
 * multiple_matches
 * error
 */
const FIELD_IDS = {
  lookupStatus: 28495128934940,
};

const LOOKUP_STATUS_VALUES = {
  found: "lookup_complete",
  notFound: "manual_lookup_required",
  multipleMatches: "manual_lookup_required",
  error: "lookup_failed",
};

/**
 * These statuses represent completed lookups.
 *
 * Automatic app loading will not call Stripe again when one of these
 * values is already stored on the ticket.
 *
 * Error is deliberately excluded so temporary failures can retry.
 */
const COMPLETED_LOOKUP_STATUSES = new Set([
  LOOKUP_STATUS_VALUES.found,
  LOOKUP_STATUS_VALUES.notFound,
  LOOKUP_STATUS_VALUES.multipleMatches,
]);

const requesterEmailElement = document.getElementById("requester-email");
const refreshButton = document.getElementById("refresh-button");
const stripeStatusElement = document.getElementById("stripe-status");
const stripeLoadingElement = document.getElementById("stripe-loading");
const stripeMessageElement = document.getElementById("stripe-message");
const stripeResultsElement = document.getElementById("stripe-results");
const spinnerElement = stripeLoadingElement.querySelector(".spinner");

/**
 * Build the ZAF path for a Zendesk custom ticket field.
 */
function getCustomFieldPath(fieldId) {
  return `ticket.customField:custom_field_${fieldId}`;
}

/**
 * Resize the Zendesk sidebar iframe to fit its contents.
 */
async function resizeApp() {
  try {
    await client.invoke("resize", {
      height: document.body.scrollHeight + 20,
    });
  } catch (error) {
    console.error("Unable to resize the Zendesk app:", error);
  }
}

/**
 * Control the spinner and Refresh button from one place.
 *
 * This ensures the spinner cannot remain active after a lookup
 * has finished or failed.
 */
function setStripeLoading(isLoading) {
  spinnerElement.hidden = !isLoading;
  spinnerElement.classList.toggle("is-active", isLoading);
  refreshButton.disabled = isLoading;
}

/**
 * Set the Stripe card status badge.
 */
function setStripeStatus(text, className) {
  stripeStatusElement.textContent = text;
  stripeStatusElement.className = `status-badge ${className}`;
}

/**
 * Show a message in the Stripe lookup area.
 */
function showStripeMessage(message, options = {}) {
  const {
    statusText = "Waiting",
    statusClass = "status-waiting",
    loading = false,
  } = options;

  setStripeStatus(statusText, statusClass);

  stripeMessageElement.textContent = message;
  stripeLoadingElement.hidden = false;

  stripeResultsElement.hidden = true;
  stripeResultsElement.replaceChildren();

  setStripeLoading(loading);
}

/**
 * Safely create one labelled data field.
 */
function createField(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const labelElement = document.createElement("span");
  labelElement.className = "field-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "field-value";
  valueElement.textContent = value || "Not available";

  wrapper.append(labelElement, valueElement);

  return wrapper;
}

/**
 * Format a Stripe Unix timestamp.
 */
function formatStripeDate(timestamp) {
  if (!timestamp) {
    return "Not available";
  }

  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Escape values for Stripe Search Query Language.
 */
function escapeStripeSearchValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Build the Stripe Customer Search API URL.
 */
function createCustomerSearchUrl(email) {
  const escapedEmail = escapeStripeSearchValue(email);
  const searchQuery = `email:'${escapedEmail}'`;

  return (
    "https://api.stripe.com/v1/customers/search" +
    `?query=${encodeURIComponent(searchQuery)}` +
    "&limit=10"
  );
}

/**
 * Build a Stripe Dashboard URL that searches broadly
 * using the supplied email address.
 */
function createStripeDashboardSearchUrl(email) {
  return (
    "https://dashboard.stripe.com/search" +
    `?query=${encodeURIComponent(email)}`
  );
}

/**
 * Build the Stripe Dashboard URL for a real Customer.
 */
function createStripeCustomerUrl(customer) {
  const modePath = customer.livemode ? "" : "/test";

  return (
    "https://dashboard.stripe.com" +
    `${modePath}/customers/` +
    encodeURIComponent(customer.id)
  );
}

/**
 * Create a clickable action link.
 */
function createActionLink(text, url, className) {
  const link = document.createElement("a");

  link.className = className;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;

  return link;
}

/**
 * Read a Zendesk custom ticket field.
 */
async function getCustomField(fieldId) {
  const fieldPath = getCustomFieldPath(fieldId);
  const result = await client.get(fieldPath);

  return result[fieldPath] || "";
}

/**
 * Update a Zendesk custom ticket field.
 */
async function setCustomField(fieldId, value) {
  const fieldPath = getCustomFieldPath(fieldId);

  await client.set(fieldPath, value);

  const check = await client.get(fieldPath);

  console.log("Lookup Status field:", {
    fieldPath,
    sent: value,
    received: check[fieldPath],
  });
}

/**
 * Read the stored lookup status.
 */
async function getLookupStatus() {
  return getCustomField(FIELD_IDS.lookupStatus);
}

/**
 * Store the result of the latest lookup.
 *
 * For dropdown fields, the supplied value must match the option tag,
 * not merely the user-facing option name.
 */
async function setLookupStatus(status) {
  await setCustomField(FIELD_IDS.lookupStatus, status);
}

/**
 * Determine whether the existing ticket value should prevent another
 * automatic Stripe request.
 */
function isCompletedLookupStatus(status) {
  return COMPLETED_LOOKUP_STATUSES.has(status);
}

/**
 * Search genuine Stripe Customer objects.
 */
async function searchStripeCustomers(email) {
  showStripeMessage(`Searching Stripe for ${email}…`, {
    statusText: "Searching",
    statusClass: "status-waiting",
    loading: true,
  });

  const response = await client.request({
    url: createCustomerSearchUrl(email),
    type: "GET",
    dataType: "json",

    headers: {
      Authorization: "Bearer {{setting.stripeSecretKey}}",
    },

    secure: true,
  });

  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Render one or more genuine Stripe customers.
 */
function renderStripeCustomers(customers) {
  setStripeLoading(false);
  stripeLoadingElement.hidden = true;
  stripeResultsElement.replaceChildren();
  stripeMessageElement.textContent = "";

  customers.forEach((customer, index) => {
    if (index > 0) {
      const divider = document.createElement("hr");
      divider.className = "match-divider";
      stripeResultsElement.append(divider);
    }

    const customerContainer = document.createElement("div");
    customerContainer.className = "stripe-customer";

    if (customers.length > 1) {
      const matchHeading = document.createElement("h3");
      matchHeading.className = "match-title";
      matchHeading.textContent = `Stripe match ${index + 1}`;

      customerContainer.append(matchHeading);
    }

    const fields = document.createElement("div");
    fields.className = "stripe-fields";

    fields.append(
      createField("Name", customer.name || "No name recorded"),
      createField("Email address", customer.email),
      createField("Customer ID", customer.id),
      createField("Created", formatStripeDate(customer.created)),
      createField("Stripe mode", customer.livemode ? "Live" : "Test"),
    );

    const actions = document.createElement("div");
    actions.className = "stripe-actions";

    actions.append(
      createActionLink(
        "Open in Stripe",
        createStripeCustomerUrl(customer),
        "primary-link",
      ),
    );

    customerContainer.append(fields, actions);
    stripeResultsElement.append(customerContainer);
  });

  stripeResultsElement.hidden = false;
}

/**
 * Render the Dashboard-search fallback.
 */
function renderStripeSearchFallback(email) {
  setStripeLoading(false);
  stripeLoadingElement.hidden = true;
  stripeResultsElement.replaceChildren();

  const container = document.createElement("div");
  container.className = "stripe-customer";

  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent =
    "No permanent Stripe customer was found. " +
    "This may be a guest customer or a payment " +
    "without a Stripe Customer record.";

  const actions = document.createElement("div");
  actions.className = "stripe-actions";

  actions.append(
    createActionLink(
      "Search Stripe Dashboard",
      createStripeDashboardSearchUrl(email),
      "primary-link",
    ),
  );

  container.append(message, actions);

  stripeResultsElement.append(container);
  stripeResultsElement.hidden = false;
}

/**
 * Render a message when an earlier completed lookup is already stored
 * on the ticket.
 *
 * This avoids another Stripe API request but still gives the agent
 * access to the broad Stripe Dashboard search.
 */
function renderStoredLookupStatus(email, lookupStatus) {
  setStripeLoading(false);
  stripeLoadingElement.hidden = true;
  stripeResultsElement.replaceChildren();

  const statusConfig = {
    [LOOKUP_STATUS_VALUES.found]: {
      badgeText: "Previously found",
      badgeClass: "status-success",
      message:
        "A successful Stripe lookup has already been recorded on this ticket.",
    },

    [LOOKUP_STATUS_VALUES.notFound]: {
      badgeText: "Previously checked",
      badgeClass: "status-warning",
      message:
        "A previous lookup did not find a permanent Stripe Customer record.",
    },

    [LOOKUP_STATUS_VALUES.multipleMatches]: {
      badgeText: "Multiple matches",
      badgeClass: "status-warning",
      message:
        "A previous lookup found more than one Stripe Customer record.",
    },
  };

  const config = statusConfig[lookupStatus];

  if (!config) {
    return;
  }

  setStripeStatus(config.badgeText, config.badgeClass);

  const container = document.createElement("div");
  container.className = "stripe-customer";

  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent =
    `${config.message} ` +
    "Use Refresh to run a new lookup.";

  const actions = document.createElement("div");
  actions.className = "stripe-actions";

  actions.append(
    createActionLink(
      "Search Stripe Dashboard",
      createStripeDashboardSearchUrl(email),
      "primary-link",
    ),
  );

  container.append(message, actions);

  stripeResultsElement.append(container);
  stripeResultsElement.hidden = false;
}

/**
 * Read the current Zendesk requester email.
 */
async function getRequesterEmail() {
  const ticketData = await client.get("ticket.requester.email");

  return (ticketData["ticket.requester.email"] || "")
    .trim()
    .toLowerCase();
}

/**
 * Perform a new Stripe lookup and save its result.
 */
async function performStripeLookup(email) {
  const customers = await searchStripeCustomers(email);

  if (customers.length === 0) {
    await setLookupStatus(LOOKUP_STATUS_VALUES.notFound);

    setStripeStatus("Dashboard search", "status-warning");
    renderStripeSearchFallback(email);

    return;
  }

  if (customers.length === 1) {
    await setLookupStatus(LOOKUP_STATUS_VALUES.found);
    setStripeStatus("Found", "status-success");
  } else {
    await setLookupStatus(LOOKUP_STATUS_VALUES.multipleMatches);

    setStripeStatus(
      `${customers.length} matches`,
      "status-warning",
    );
  }

  renderStripeCustomers(customers);
}

/**
 * Load requester information and perform the lookup.
 *
 * forceRefresh:
 * - false: respect a completed stored lookup status
 * - true: ignore the stored status and call Stripe again
 */
async function loadCustomerLookup({ forceRefresh = false } = {}) {
  setStripeLoading(true);

  requesterEmailElement.textContent = "Loading requester…";

  try {
    const email = await getRequesterEmail();

    requesterEmailElement.textContent =
      email || "No requester email available";

    if (!email) {
      showStripeMessage(
        "Stripe cannot be searched because this ticket has no requester email.",
        {
          statusText: "No email",
          statusClass: "status-warning",
          loading: false,
        },
      );

      return;
    }

    if (!forceRefresh) {
      const existingLookupStatus = await getLookupStatus();

      if (isCompletedLookupStatus(existingLookupStatus)) {
        renderStoredLookupStatus(email, existingLookupStatus);
        return;
      }
    }

    await performStripeLookup(email);
  } catch (error) {
    console.error("Stripe customer lookup failed:", error);

    /*
     * Store error where possible, but do not allow a field-writing
     * failure to hide the original Stripe error.
     */
    try {
      await setLookupStatus(LOOKUP_STATUS_VALUES.error);
    } catch (fieldError) {
      console.error(
        "Unable to update the Zendesk lookup-status field:",
        fieldError,
      );
    }

    const stripeErrorMessage =
      error?.responseJSON?.error?.message;

    showStripeMessage(
      stripeErrorMessage
        ? `Stripe error: ${stripeErrorMessage}`
        : "The Stripe lookup failed. Check the API key, field ID and app configuration.",
      {
        statusText: "Error",
        statusClass: "status-error",
        loading: false,
      },
    );
  } finally {
    /*
     * This is the main spinner fix.
     *
     * It runs after success, no result, an existing cached result,
     * or any thrown error.
     */
    setStripeLoading(false);
    await resizeApp();
  }
}

/**
 * Manual Refresh always performs a new Stripe API request.
 */
refreshButton.addEventListener("click", () => {
  loadCustomerLookup({
    forceRefresh: true,
  });
});

/**
 * A requester change represents a different person, so the previous
 * ticket-level lookup status should not prevent a new lookup.
 */
client.on("ticket.requester.email.changed", () => {
  loadCustomerLookup({
    forceRefresh: true,
  });
});

/**
 * Initial app load respects the stored lookup status.
 */
loadCustomerLookup({
  forceRefresh: false,
});