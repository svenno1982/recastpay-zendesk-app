const client = ZAFClient.init();

const requesterEmailElement = document.getElementById("requester-email");

const refreshButton = document.getElementById("refresh-button");

const stripeStatusElement = document.getElementById("stripe-status");

const stripeLoadingElement = document.getElementById("stripe-loading");

const stripeMessageElement = document.getElementById("stripe-message");

const stripeResultsElement = document.getElementById("stripe-results");

const spinnerElement = stripeLoadingElement.querySelector(".spinner");

/**
 * Resize the Zendesk sidebar iframe to fit its contents.
 */
async function resizeApp() {
  await client.invoke("resize", {
    height: document.body.scrollHeight + 20,
  });
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

  spinnerElement.hidden = !loading;
  spinnerElement.classList.toggle("is-active", loading);
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
  stripeLoadingElement.hidden = true;
  stripeResultsElement.replaceChildren();

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
 * Read the current Zendesk requester email.
 */
async function getRequesterEmail() {
  const ticketData = await client.get("ticket.requester.email");

  return (ticketData["ticket.requester.email"] || "").trim().toLowerCase();
}

/**
 * Load requester information and perform the lookup.
 */
async function loadCustomerLookup() {
  refreshButton.disabled = true;

  requesterEmailElement.textContent = "Loading requester…";

  try {
    const email = await getRequesterEmail();

    requesterEmailElement.textContent = email || "No requester email available";

    if (!email) {
      showStripeMessage(
        "Stripe cannot be searched because this ticket has no requester email.",
        {
          statusText: "No email",
          statusClass: "status-warning",
        },
      );

      return;
    }

    const customers = await searchStripeCustomers(email);

    if (customers.length === 0) {
      setStripeStatus("Dashboard search", "status-warning");

      renderStripeSearchFallback(email);
      return;
    }

    if (customers.length === 1) {
      setStripeStatus("Found", "status-success");
    } else {
      setStripeStatus(`${customers.length} matches`, "status-warning");
    }

    renderStripeCustomers(customers);
  } catch (error) {
    console.error("Stripe customer lookup failed:", error);

    const stripeErrorMessage = error?.responseJSON?.error?.message;

    showStripeMessage(
      stripeErrorMessage
        ? `Stripe error: ${stripeErrorMessage}`
        : "The Stripe lookup failed. Check the API key and app configuration.",
      {
        statusText: "Error",
        statusClass: "status-error",
      },
    );
  } finally {
    refreshButton.disabled = false;
    await resizeApp();
  }
}

refreshButton.addEventListener("click", loadCustomerLookup);

client.on("ticket.requester.email.changed", loadCustomerLookup);

loadCustomerLookup();
