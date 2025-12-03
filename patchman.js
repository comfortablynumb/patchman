$(document).ready(function() {
  let selectedBodyType = 'none';
  let currentJsonTree = null;
  let collections = [];
  let currentRequestId = null;
  let currentCollectionId = null;
  let requestHistory = [];
  const MAX_HISTORY_ITEMS = 50;
  let originalRequestState = null; // Store original state to detect changes
  let unsavedRequestData = {}; // Store unsaved form state per request ID: { requestId: formState }

  // Load collections and history from storage
  loadCollections();
  loadHistory();

  // Warn before closing tab if there are unsaved changes
  $(window).on('beforeunload', function(e) {
    // Check current form for unsaved changes
    if (hasUnsavedChanges()) {
      e.preventDefault();
      return 'You have unsaved changes. Are you sure you want to leave?';
    }

    // Check stored unsaved data
    if (Object.keys(unsavedRequestData).length > 0) {
      e.preventDefault();
      return 'You have unsaved changes. Are you sure you want to leave?';
    }
  });

  // Sidebar section collapse/expand
  $(document).on('click', '.sidebar-section-header', function(e) {
    // Don't toggle if clicking on action buttons
    if ($(e.target).closest('.sidebar-section-actions').length) return;

    const $section = $(this).closest('.sidebar-section');
    $section.toggleClass('expanded');
  });

  // Variables management
  // Structure: environments = { envName: { varName: value } }
  // Collection variables are stored in collection.variables
  // Collection variables override environment (global) variables
  const DEFAULT_ENVIRONMENT = 'Default Environment';
  let environments = {};
  let currentEnvironment = DEFAULT_ENVIRONMENT;

  loadVariables();

  function loadVariables() {
    chrome.storage.local.get(['patchman_environments', 'patchman_current_env'], function(result) {
      environments = result.patchman_environments || {};

      // Ensure Default Environment always exists
      if (!environments[DEFAULT_ENVIRONMENT]) {
        environments[DEFAULT_ENVIRONMENT] = {};
      }

      currentEnvironment = result.patchman_current_env || DEFAULT_ENVIRONMENT;

      // If current environment doesn't exist, fall back to default
      if (!environments[currentEnvironment]) {
        currentEnvironment = DEFAULT_ENVIRONMENT;
      }

      renderEnvironments();
      renderVariables();
    });
  }

  function saveVariables() {
    chrome.storage.local.set({
      patchman_environments: environments,
      patchman_current_env: currentEnvironment
    }, function() {
      renderEnvironments();
      updateVariablesWithDetected();
    });
  }

  function renderVariables() {
    // Use the enhanced rendering that detects used variables
    updateVariablesWithDetected();
  }

  function renderEnvironments() {
    const $select = $('#environment-select');

    $select.empty();

    // Sort environments but keep Default Environment first
    const envNames = Object.keys(environments).sort((a, b) => {
      if (a === DEFAULT_ENVIRONMENT) return -1;
      if (b === DEFAULT_ENVIRONMENT) return 1;
      return a.localeCompare(b);
    });

    envNames.forEach(function(envName) {
      $select.append(`<option value="${escapeHtml(envName)}">${escapeHtml(envName)}</option>`);
    });

    $select.val(currentEnvironment);
  }

  // Current variable scope tab (only 'global' and 'collection' now)
  let currentVarScope = 'global';
  let $variablesModal = null;

  // Environment selection
  $('#environment-select').on('change', function() {
    currentEnvironment = $(this).val();
    saveVariables();
  });

  // Open variables modal
  $('#open-variables-btn').on('click', function() {
    showVariablesModal();
  });

  function showEnvironmentManager() {
    // Sort environments with Default Environment first
    const envNames = Object.keys(environments).sort((a, b) => {
      if (a === DEFAULT_ENVIRONMENT) return -1;
      if (b === DEFAULT_ENVIRONMENT) return 1;
      return a.localeCompare(b);
    });

    const envList = envNames.map(name => {
      const isDefault = name === DEFAULT_ENVIRONMENT;
      return `
        <div class="env-manager-item" data-env-name="${escapeHtml(name)}">
          <span class="env-manager-name">${escapeHtml(name)}${isDefault ? ' <span class="text-slate-500 text-xs">(default)</span>' : ''}</span>
          <button class="env-manager-edit" title="Edit Variables">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          ${isDefault ? '' : `
            <button class="env-manager-delete" title="Delete">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          `}
        </div>
      `;
    }).join('');

    const $modal = $(`
      <div class="modal-overlay">
        <div class="modal" style="min-width: 400px;">
          <h3 class="modal-title">Manage Environments</h3>
          <div class="env-manager-list">
            ${envList || '<p class="text-slate-500 text-sm text-center py-4">No environments yet</p>'}
          </div>
          <div class="env-create-form">
            <input type="text" class="modal-input" id="new-env-name" placeholder="New environment name..." style="margin-bottom: 0;">
            <button class="modal-btn modal-btn-primary" id="add-env-btn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <div class="modal-actions" style="margin-top: 1rem;">
            <button class="modal-btn modal-btn-secondary close-modal-btn">Close</button>
          </div>
        </div>
      </div>
    `);

    $('body').append($modal);

    $modal.find('.close-modal-btn').on('click', () => $modal.remove());
    $modal.on('click', function(e) {
      if ($(e.target).hasClass('modal-overlay')) $modal.remove();
    });

    $modal.find('#add-env-btn').on('click', function() {
      const name = $modal.find('#new-env-name').val().trim();
      if (name && !environments.hasOwnProperty(name)) {
        environments[name] = {};
        saveVariables();
        $modal.remove();
        showEnvironmentManager();
      }
    });

    $modal.find('#new-env-name').on('keypress', function(e) {
      if (e.which === 13) $modal.find('#add-env-btn').click();
    });

    $modal.on('click', '.env-manager-edit', function() {
      const envName = $(this).closest('.env-manager-item').data('env-name');
      $modal.remove();
      currentEnvironment = envName;
      $('#environment-select').val(envName);
      currentVarScope = 'global';
      saveVariables();
      showVariablesModal();
    });

    $modal.on('click', '.env-manager-delete', function() {
      const envName = $(this).closest('.env-manager-item').data('env-name');

      // Prevent deleting default environment
      if (envName === DEFAULT_ENVIRONMENT) {
        return;
      }

      if (confirm(`Delete environment "${envName}"?`)) {
        delete environments[envName];
        if (currentEnvironment === envName) {
          currentEnvironment = DEFAULT_ENVIRONMENT;
          $('#environment-select').val(DEFAULT_ENVIRONMENT);
        }
        saveVariables();
        $modal.remove();
        showEnvironmentManager();
      }
    });
  }

  function showVariablesModal() {
    // Close existing modal if open
    if ($variablesModal) {
      $variablesModal.remove();
    }

    // Sort environments with Default first
    const envNames = Object.keys(environments).sort((a, b) => {
      if (a === DEFAULT_ENVIRONMENT) return -1;
      if (b === DEFAULT_ENVIRONMENT) return 1;
      return a.localeCompare(b);
    });

    const envOptions = envNames.map(name =>
      `<option value="${escapeHtml(name)}" ${name === currentEnvironment ? 'selected' : ''}>${escapeHtml(name)}</option>`
    ).join('');

    $variablesModal = $(`
      <div class="modal-overlay">
        <div class="modal variables-modal">
          <div class="variables-modal-header">
            <h3 class="variables-modal-title">Variables</h3>
            <button class="variables-modal-close">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="variables-modal-env">
            <select id="modal-env-select" class="environment-select" style="flex: 1;">
              ${envOptions}
            </select>
            <button class="variables-modal-env-manage" title="Manage Environments">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
          </div>

          <div class="variables-modal-tabs">
            <button class="variables-modal-tab ${currentVarScope === 'global' ? 'active' : ''}" data-var-scope="global">Global</button>
            <button class="variables-modal-tab ${currentVarScope === 'collection' ? 'active' : ''}" data-var-scope="collection">Collection</button>
          </div>

          <div class="variables-modal-content">
            <div class="variables-modal-list" id="modal-variables-list"></div>
          </div>

          <div class="variables-modal-footer">
            <button class="variables-modal-add" id="modal-add-variable-btn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Add Variable
            </button>
            <button class="variables-modal-done">Done</button>
          </div>
        </div>
      </div>
    `);

    $('body').append($variablesModal);
    renderModalVariables();

    // Close modal handlers
    $variablesModal.find('.variables-modal-close, .variables-modal-done').on('click', function() {
      $variablesModal.remove();
      $variablesModal = null;
    });

    $variablesModal.on('click', function(e) {
      if ($(e.target).hasClass('modal-overlay')) {
        $variablesModal.remove();
        $variablesModal = null;
      }
    });

    // Environment select in modal
    $variablesModal.find('#modal-env-select').on('change', function() {
      currentEnvironment = $(this).val();
      $('#environment-select').val(currentEnvironment);
      saveVariables();
      renderModalVariables();
    });

    // Manage environments button
    $variablesModal.find('.variables-modal-env-manage').on('click', function() {
      $variablesModal.remove();
      $variablesModal = null;
      showEnvironmentManager();
    });

    // Tab switching
    $variablesModal.on('click', '.variables-modal-tab', function() {
      currentVarScope = $(this).data('var-scope');
      $variablesModal.find('.variables-modal-tab').removeClass('active');
      $(this).addClass('active');
      renderModalVariables();
    });

    // Add variable button
    $variablesModal.find('#modal-add-variable-btn').on('click', function() {
      addNewVariableInModal();
    });

    // Variable name change
    $variablesModal.on('blur', '.var-modal-name', function() {
      if ($(this).prop('readonly')) return;

      const $item = $(this).closest('.var-modal-item');
      const oldName = $item.data('var-name');
      const scope = $item.data('var-scope') || currentVarScope;
      const newName = $(this).val().trim().replace(/[^a-zA-Z0-9_-]/g, '_');

      if (!newName) {
        $(this).val(oldName);
        return;
      }

      if (newName !== oldName) {
        const targetVars = getVariablesForScopeByName(scope);
        if (targetVars.hasOwnProperty(newName)) {
          $(this).val(oldName);
          return;
        }

        const value = targetVars[oldName];
        delete targetVars[oldName];
        targetVars[newName] = value;
        $item.data('var-name', newName);
        saveVariablesForScope(scope);
      }
    });

    // Variable value change
    $variablesModal.on('blur', '.var-modal-value', function() {
      const $item = $(this).closest('.var-modal-item');
      const name = $item.data('var-name');
      const scope = $item.data('var-scope') || currentVarScope;
      const value = $(this).val();

      const targetVars = getVariablesForScopeByName(scope);
      targetVars[name] = value;
      saveVariablesForScope(scope);
      updateVariablesBadge();
    });

    // Delete variable
    $variablesModal.on('click', '.var-modal-delete', function() {
      const $item = $(this).closest('.var-modal-item');
      const name = $item.data('var-name');
      const scope = $item.data('var-scope') || currentVarScope;

      const targetVars = getVariablesForScopeByName(scope);
      delete targetVars[name];
      saveVariablesForScope(scope);
      renderModalVariables();
    });
  }

  function addNewVariableInModal() {
    let baseName = 'new_var';
    let name = baseName;
    let counter = 1;

    const targetVars = getVariablesForScope(currentVarScope);
    while (targetVars.hasOwnProperty(name)) {
      name = `${baseName}_${counter}`;
      counter++;
    }

    addVariableToScope(name, '', currentVarScope);
    renderModalVariables();

    setTimeout(function() {
      const $newItem = $variablesModal.find(`.var-modal-item[data-var-name="${name}"]`);
      $newItem.find('.var-modal-name').focus().select();
    }, 50);
  }

  function renderModalVariables() {
    if (!$variablesModal) return;

    const { usedVars, varsWithDefaults } = detectUsedVariables();
    const $list = $variablesModal.find('#modal-variables-list');
    $list.empty();

    const allVars = getEffectiveVariables();
    let varsToShow = {};

    switch (currentVarScope) {
      case 'global':
        // Global variables are stored in the current environment
        if (currentEnvironment && environments[currentEnvironment]) {
          varsToShow = { ...environments[currentEnvironment] };
        }
        break;
      case 'collection':
        if (currentCollectionId) {
          const collection = collections.find(c => c.id === currentCollectionId);
          if (collection && collection.variables) {
            varsToShow = { ...collection.variables };
          }
        }
        break;
    }

    const varNames = Object.keys(varsToShow);

    if (varNames.length === 0) {
      let emptyMsg = 'No variables defined';
      if (currentVarScope === 'collection' && !currentCollectionId) {
        emptyMsg = 'Select a collection first';
      }

      $list.html(`
        <div class="variables-modal-empty">
          <p>${emptyMsg}</p>
          <p class="text-slate-600 text-xs mt-2">Use: <code>\${var:name}</code></p>
        </div>
      `);
      return;
    }

    const sortedVars = varNames.sort((a, b) => a.localeCompare(b));

    sortedVars.forEach(function(name) {
      const value = varsToShow[name] || '';
      const isUsed = usedVars.has(name);
      const effectiveValue = allVars[name] || '';
      const isUndefined = effectiveValue === '';
      const hasDefault = varsWithDefaults.has(name);
      const needsValue = isUsed && isUndefined && !hasDefault;

      const $item = $(`
        <div class="var-modal-item ${needsValue ? 'needs-value' : ''} ${isUsed ? 'is-used' : ''}" data-var-name="${escapeHtml(name)}" data-var-scope="${currentVarScope}">
          <input type="text" class="var-modal-name" value="${escapeHtml(name)}" placeholder="name">
          <input type="text" class="var-modal-value" value="${escapeHtml(value)}" placeholder="${needsValue ? '⚠ needs value' : 'value'}">
          <button class="var-modal-delete" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `);
      $list.append($item);
    });
  }

  function getVariablesForScope(scope) {
    switch (scope) {
      case 'global':
        // Global variables are stored in the current environment
        if (currentEnvironment && environments[currentEnvironment]) {
          return environments[currentEnvironment];
        }
        return {};
      case 'collection':
        if (currentCollectionId) {
          const collection = collections.find(c => c.id === currentCollectionId);
          if (collection) {
            if (!collection.variables) collection.variables = {};
            return collection.variables;
          }
        }
        return {};
      default:
        return getEffectiveVariables();
    }
  }

  function addVariableToScope(name, value, scope) {
    switch (scope) {
      case 'global':
        // Global variables go to the current environment
        if (currentEnvironment) {
          if (!environments[currentEnvironment]) environments[currentEnvironment] = {};
          environments[currentEnvironment][name] = value;
        }
        saveVariables();
        break;
      case 'collection':
        if (currentCollectionId) {
          const collection = collections.find(c => c.id === currentCollectionId);
          if (collection) {
            if (!collection.variables) collection.variables = {};
            collection.variables[name] = value;
            saveCollections();
            updateVariablesWithDetected();
            return;
          }
        }
        // Fallback to global/environment
        if (currentEnvironment) {
          if (!environments[currentEnvironment]) environments[currentEnvironment] = {};
          environments[currentEnvironment][name] = value;
        }
        saveVariables();
        break;
    }
  }

  function getVariablesForScopeByName(scope) {
    switch (scope) {
      case 'global':
        // Global variables are stored in the current environment
        if (currentEnvironment && environments[currentEnvironment]) {
          return environments[currentEnvironment];
        }
        // Ensure environment exists
        if (currentEnvironment) {
          environments[currentEnvironment] = {};
          return environments[currentEnvironment];
        }
        return {};
      case 'collection':
        if (currentCollectionId) {
          const collection = collections.find(c => c.id === currentCollectionId);
          if (collection) {
            if (!collection.variables) collection.variables = {};
            return collection.variables;
          }
        }
        // Fallback to global
        return getVariablesForScopeByName('global');
      default:
        return getVariablesForScopeByName('global');
    }
  }

  function saveVariablesForScope(scope) {
    if (scope === 'collection') {
      saveCollections();
      updateVariablesWithDetected();
    } else {
      saveVariables();
    }
  }

  // Detect variables used in the request
  // Returns { usedVars: Set, varsWithDefaults: Set }
  function detectUsedVariables() {
    const usedVars = new Set();
    const varsWithDefaults = new Set();
    // Match ${var:name} or ${var:name:default} - capture name and check if default exists
    const varRegex = /\$\{var:([a-zA-Z0-9_-]+)(:([^}]*))?\}/g;

    function scanText(text) {
      if (!text) return;
      varRegex.lastIndex = 0;
      let match;
      while ((match = varRegex.exec(text)) !== null) {
        usedVars.add(match[1]);
        // If there's a default value (match[2] exists and match[3] is the default)
        if (match[2] !== undefined) {
          varsWithDefaults.add(match[1]);
        }
      }
    }

    // Scan URL
    scanText($('#url-input').val());

    // Scan params
    $('#params-container .param-row').each(function() {
      scanText($(this).find('.param-key').val());
      scanText($(this).find('.param-value').val());
    });

    // Scan headers
    $('#headers-container .header-row').each(function() {
      scanText($(this).find('.header-key').val());
      scanText($(this).find('.header-value').val());
    });

    // Scan auth fields
    const authFields = [
      '#auth-basic-username', '#auth-basic-password',
      '#auth-bearer-token',
      '#auth-api-key-name', '#auth-api-key-value',
      '#auth-oauth2-token-url', '#auth-oauth2-auth-url', '#auth-oauth2-client-id',
      '#auth-oauth2-client-secret', '#auth-oauth2-redirect-uri', '#auth-oauth2-scope',
      '#auth-oauth2-username', '#auth-oauth2-password'
    ];
    authFields.forEach(selector => scanText($(selector).val()));

    // Scan body fields
    const bodyFields = [
      '#body-json-input', '#body-xml-input', '#body-raw-input', '#body-raw-content-type'
    ];
    bodyFields.forEach(selector => scanText($(selector).val()));

    // Scan form fields
    $('#form-fields-container .form-field-row').each(function() {
      scanText($(this).find('.form-field-key').val());
      scanText($(this).find('.form-field-value').val());
    });

    // Scan schema form inputs
    $('#schema-form-preview .schema-field-input').each(function() {
      scanText($(this).val());
    });

    return { usedVars, varsWithDefaults };
  }

  // Update variables badge and modal if open
  // Also auto-adds detected variables to current environment's global scope
  function updateVariablesWithDetected() {
    const { usedVars } = detectUsedVariables();
    const allVars = getEffectiveVariables();

    // Auto-add any detected variables that don't exist yet to the current environment
    let addedNew = false;
    if (currentEnvironment && environments[currentEnvironment]) {
      usedVars.forEach(name => {
        if (!allVars.hasOwnProperty(name)) {
          environments[currentEnvironment][name] = '';
          addedNew = true;
        }
      });

      if (addedNew) {
        saveVariables();
      }
    }

    updateVariablesBadge();

    // Update modal if it's open
    if ($variablesModal) {
      renderModalVariables();
    }
  }

  // Get list of missing variables (used but have no value and no default)
  function getMissingVariables() {
    const { usedVars, varsWithDefaults } = detectUsedVariables();
    const allVars = getEffectiveVariables();
    const missing = [];

    usedVars.forEach(name => {
      const isUndefined = !allVars.hasOwnProperty(name) || allVars[name] === '';
      const hasDefault = varsWithDefaults.has(name);
      if (isUndefined && !hasDefault) {
        missing.push(name);
      }
    });

    return missing;
  }

  // Update the badge showing count of missing variables
  function updateVariablesBadge() {
    const missing = getMissingVariables();

    const $badge = $('#variables-badge');
    if (missing.length > 0) {
      $badge.text(missing.length).removeClass('hidden');
    } else {
      $badge.addClass('hidden');
    }
  }

  // Get effective variables (environment global + collection override)
  function getEffectiveVariables() {
    const effective = {};

    // Start with environment (global) variables
    if (currentEnvironment && environments[currentEnvironment]) {
      Object.assign(effective, environments[currentEnvironment]);
    }

    // Override with collection variables
    if (currentCollectionId) {
      const collection = collections.find(c => c.id === currentCollectionId);
      if (collection && collection.variables) {
        Object.assign(effective, collection.variables);
      }
    }

    return effective;
  }

  // Debounce function
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Debounced variable detection
  const debouncedUpdateVariables = debounce(updateVariablesWithDetected, 300);

  // Listen for input changes to detect variables
  $(document).on('input', '#url-input, .param-key, .param-value, .header-key, .header-value, #auth-basic-username, #auth-basic-password, #auth-bearer-token, #auth-api-key-name, #auth-api-key-value, #auth-oauth2-token-url, #auth-oauth2-auth-url, #auth-oauth2-client-id, #auth-oauth2-client-secret, #auth-oauth2-redirect-uri, #auth-oauth2-scope, #auth-oauth2-username, #auth-oauth2-password, #body-json-input, #body-xml-input, #body-raw-input, #body-raw-content-type, .form-field-key, .form-field-value, .schema-field-input', function() {
    debouncedUpdateVariables();
  });

  // Interpolation function
  // Supports: ${var:name} and ${var:name:default}
  function interpolateVariables(text) {
    if (!text || typeof text !== 'string') return text;

    // Get effective variables (global + environment + collection)
    const effectiveVars = getEffectiveVariables();

    // Match ${var:name} or ${var:name:default}
    // The regex captures: name and optional default value
    return text.replace(/\$\{var:([a-zA-Z0-9_-]+)(?::([^}]*))?\}/g, function(match, name, defaultValue) {
      if (effectiveVars.hasOwnProperty(name) && effectiveVars[name] !== '') {
        return effectiveVars[name];
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      // Return the original match if no value and no default
      return match;
    });
  }

  // Interpolate object values (for headers, params, etc.)
  function interpolateObject(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const interpolatedKey = interpolateVariables(key);
      const interpolatedValue = interpolateVariables(value);
      result[interpolatedKey] = interpolatedValue;
    }
    return result;
  }

  // Collection management functions
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function loadCollections() {
    chrome.storage.local.get(['patchman_collections'], function(result) {
      collections = result.patchman_collections || [];
      renderCollections();
    });
  }

  function saveCollections() {
    chrome.storage.local.set({ patchman_collections: collections }, function() {
      renderCollections();
    });
  }

  function renderCollections() {
    const $tree = $('#collections-tree');
    const $empty = $('#empty-collections');

    if (collections.length === 0) {
      $empty.removeClass('hidden');
      $tree.find('.collection-item').remove();
      return;
    }

    $empty.addClass('hidden');
    $tree.find('.collection-item').remove();

    collections.forEach(function(collection) {
      const isActiveCollection = collection.id === currentCollectionId;
      const $item = $(`
        <div class="collection-item ${collection.expanded ? 'expanded' : ''}" data-collection-id="${collection.id}">
          <div class="collection-header ${isActiveCollection ? 'active' : ''}">
            <svg class="collection-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <span class="collection-name">${escapeHtml(collection.name)}</span>
            <div class="collection-actions">
              <button class="collection-action-btn add-request-btn" title="Add Request">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
              <button class="collection-action-btn export-collection-btn" title="Export Collection">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </button>
              <button class="collection-action-btn rename-collection-btn" title="Rename">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button class="collection-action-btn delete delete-collection-btn" title="Delete">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="collection-requests"></div>
        </div>
      `);

      const $requests = $item.find('.collection-requests');
      (collection.requests || []).forEach(function(request) {
        const $request = $(`
          <div class="request-item ${request.id === currentRequestId ? 'active' : ''}" data-request-id="${request.id}">
            <span class="request-method ${request.method}">${request.method}</span>
            <span class="request-name">${escapeHtml(request.name)}</span>
            <div class="request-actions">
              <button class="collection-action-btn delete delete-request-btn" title="Delete">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        `);
        $requests.append($request);
      });

      $tree.append($item);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showModal(title, inputValue, onConfirm, confirmText = 'Save', isDanger = false) {
    const $modal = $(`
      <div class="modal-overlay">
        <div class="modal">
          <h3 class="modal-title">${title}</h3>
          <input type="text" class="modal-input" value="${escapeHtml(inputValue)}" placeholder="Enter name...">
          <div class="modal-actions">
            <button class="modal-btn modal-btn-secondary cancel-btn">Cancel</button>
            <button class="modal-btn ${isDanger ? 'modal-btn-danger' : 'modal-btn-primary'} confirm-btn">${confirmText}</button>
          </div>
        </div>
      </div>
    `);

    $('body').append($modal);
    $modal.find('.modal-input').focus().select();

    $modal.find('.cancel-btn').on('click', function() {
      $modal.remove();
    });

    $modal.find('.confirm-btn').on('click', function() {
      const value = $modal.find('.modal-input').val().trim();
      if (value) {
        onConfirm(value);
        $modal.remove();
      }
    });

    $modal.find('.modal-input').on('keypress', function(e) {
      if (e.which === 13) {
        $modal.find('.confirm-btn').click();
      }
    });

    $modal.on('click', function(e) {
      if ($(e.target).hasClass('modal-overlay')) {
        $modal.remove();
      }
    });
  }

  function showConfirmModal(title, message, onConfirm) {
    const $modal = $(`
      <div class="modal-overlay">
        <div class="modal">
          <h3 class="modal-title">${title}</h3>
          <p class="text-slate-400 text-sm mb-4">${message}</p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-secondary cancel-btn">Cancel</button>
            <button class="modal-btn modal-btn-danger confirm-btn">Delete</button>
          </div>
        </div>
      </div>
    `);

    $('body').append($modal);

    $modal.find('.cancel-btn').on('click', function() {
      $modal.remove();
    });

    $modal.find('.confirm-btn').on('click', function() {
      onConfirm();
      $modal.remove();
    });

    $modal.on('click', function(e) {
      if ($(e.target).hasClass('modal-overlay')) {
        $modal.remove();
      }
    });
  }

  // New Collection
  $('#new-collection-btn').on('click', function() {
    showModal('New Collection', '', function(name) {
      const collection = {
        id: generateId(),
        name: name,
        requests: [],
        expanded: true
      };
      collections.push(collection);
      saveCollections();
    }, 'Create');
  });

  // Toggle collection expand/collapse and select collection
  $(document).on('click', '.collection-header', function(e) {
    if ($(e.target).closest('.collection-actions').length) return;

    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      collection.expanded = !collection.expanded;
      $item.toggleClass('expanded');

      // Select this collection (allows saving new requests to it)
      currentCollectionId = collectionId;

      // Update visual selection
      $('.collection-header').removeClass('active');
      $(this).addClass('active');

      // Show request name bar so user can set a name for new requests
      $('#request-name-bar').removeClass('hidden');

      // Update variables for the selected collection
      updateVariablesWithDetected();

      saveCollections();
    }
  });

  // Rename collection
  $(document).on('click', '.rename-collection-btn', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      showModal('Rename Collection', collection.name, function(name) {
        collection.name = name;
        saveCollections();
      });
    }
  });

  // Export individual collection
  $(document).on('click', '.export-collection-btn', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      const dataStr = JSON.stringify([collection], null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patchman-${collection.name.toLowerCase().replace(/\s+/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });

  // Delete collection
  $(document).on('click', '.delete-collection-btn', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      showConfirmModal(
        'Delete Collection',
        `Are you sure you want to delete "${escapeHtml(collection.name)}" and all its requests?`,
        function() {
          collections = collections.filter(c => c.id !== collectionId);
          if (currentCollectionId === collectionId) {
            currentCollectionId = null;
            currentRequestId = null;
            clearRequestForm();
          }
          saveCollections();
        }
      );
    }
  });

  // Add request to collection
  $(document).on('click', '.add-request-btn', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      showModal('New Request', '', function(name) {
        // Store unsaved data for current request before creating new one
        storeUnsavedDataForCurrentRequest();

        const request = {
          id: generateId(),
          name: name,
          method: 'GET',
          url: '',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { type: 'none', content: '' }
        };
        collection.requests.push(request);
        collection.expanded = true;
        currentCollectionId = collectionId;
        currentRequestId = request.id;
        loadRequestIntoForm(request);
        saveCollections();
      }, 'Create');
    }
  });

  // Load request when clicked
  $(document).on('click', '.request-item', function(e) {
    if ($(e.target).closest('.request-actions').length) return;

    const $item = $(this);
    const requestId = $item.data('request-id');
    const $collection = $item.closest('.collection-item');
    const collectionId = $collection.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      const request = collection.requests.find(r => r.id === requestId);
      if (request) {
        // Store unsaved data for current request before switching
        storeUnsavedDataForCurrentRequest();

        currentCollectionId = collectionId;
        currentRequestId = requestId;
        loadRequestIntoForm(request);
        $('.request-item').removeClass('active');
        $item.addClass('active');

        // Mark collection header as active too
        $('.collection-header').removeClass('active');
        $collection.find('.collection-header').addClass('active');
      }
    }
  });

  // Delete request
  $(document).on('click', '.delete-request-btn', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.request-item');
    const requestId = $item.data('request-id');
    const $collection = $item.closest('.collection-item');
    const collectionId = $collection.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      const request = collection.requests.find(r => r.id === requestId);
      if (request) {
        showConfirmModal(
          'Delete Request',
          `Are you sure you want to delete "${escapeHtml(request.name)}"?`,
          function() {
            collection.requests = collection.requests.filter(r => r.id !== requestId);
            // Clean up any unsaved data for this request
            delete unsavedRequestData[requestId];
            if (currentRequestId === requestId) {
              currentRequestId = null;
              clearRequestForm();
            }
            saveCollections();
          }
        );
      }
    }
  });

  // Save request button
  $('#save-request-btn').on('click', function() {
    // If no collection is selected, show a message
    if (!currentCollectionId) {
      showInfoModal(
        'Select a Collection',
        'To save this request, please first select a collection from the sidebar or create a new one.'
      );
      return;
    }

    const collection = collections.find(c => c.id === currentCollectionId);
    if (!collection) return;

    // If no current request (new request), create a new one
    if (!currentRequestId) {
      // Get name from the form, or use a default
      const requestName = $('#request-name').val().trim() || 'Untitled Request';

      const request = {
        id: generateId(),
        name: requestName,
        method: $('#method-select').val(),
        url: $('#url-input').val().trim(),
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' }
      };
      saveRequestFromForm(request);
      collection.requests.push(request);
      collection.expanded = true;
      currentRequestId = request.id;
      $('#request-name-bar').removeClass('hidden');
      $('#request-name').val(request.name);
      saveCollections();
      clearUnsavedDataForRequest(request.id);
      storeOriginalState(); // Clear dirty state
      return;
    }

    const request = collection.requests.find(r => r.id === currentRequestId);
    if (!request) return;

    saveRequestFromForm(request);
    saveCollections();
    clearUnsavedDataForRequest(currentRequestId);
    storeOriginalState(); // Clear dirty state
  });

  function showInfoModal(title, message) {
    const $modal = $(`
      <div class="modal-overlay">
        <div class="modal">
          <h3 class="modal-title">${title}</h3>
          <p class="text-slate-400 text-sm mb-4">${message}</p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-primary ok-btn">OK</button>
          </div>
        </div>
      </div>
    `);

    $('body').append($modal);

    $modal.find('.ok-btn').on('click', function() {
      $modal.remove();
    });

    $modal.on('click', function(e) {
      if ($(e.target).hasClass('modal-overlay')) {
        $modal.remove();
      }
    });
  }

  // Get current form state for change tracking
  function getCurrentFormState() {
    const state = {
      name: $('#request-name').val() || '',
      method: $('#method-select').val() || 'GET',
      url: $('#url-input').val() || '',
      params: [],
      headers: [],
      auth: { type: $('#auth-type').val() || 'none' },
      body: { type: selectedBodyType }
    };

    // Get params
    $('#params-container .param-row').each(function() {
      const key = $(this).find('.param-key').val() || '';
      const value = $(this).find('.param-value').val() || '';
      if (key || value) {
        state.params.push({ key, value });
      }
    });

    // Get headers
    $('#headers-container .header-row').each(function() {
      const key = $(this).find('.header-key').val() || '';
      const value = $(this).find('.header-value').val() || '';
      if (key || value) {
        state.headers.push({ key, value });
      }
    });

    // Get auth details
    if (state.auth.type === 'basic') {
      state.auth.username = $('#auth-basic-username').val() || '';
      state.auth.password = $('#auth-basic-password').val() || '';
    } else if (state.auth.type === 'bearer') {
      state.auth.token = $('#auth-bearer-token').val() || '';
    } else if (state.auth.type === 'api-key') {
      state.auth.keyName = $('#auth-api-key-name').val() || '';
      state.auth.keyValue = $('#auth-api-key-value').val() || '';
      state.auth.location = $('#auth-api-key-location').val() || 'header';
    } else if (state.auth.type === 'oauth2') {
      state.auth.grantType = $('#auth-oauth2-grant-type').val() || 'authorization_code';
      state.auth.tokenUrl = $('#auth-oauth2-token-url').val() || '';
      state.auth.authUrl = $('#auth-oauth2-auth-url').val() || '';
      state.auth.clientId = $('#auth-oauth2-client-id').val() || '';
      state.auth.clientSecret = $('#auth-oauth2-client-secret').val() || '';
      state.auth.redirectUri = $('#auth-oauth2-redirect-uri').val() || '';
      state.auth.scope = $('#auth-oauth2-scope').val() || '';
      state.auth.username = $('#auth-oauth2-username').val() || '';
      state.auth.password = $('#auth-oauth2-password').val() || '';
      state.auth.accessToken = $('#auth-oauth2-access-token').val() || '';
      state.auth.refreshToken = $('#auth-oauth2-access-token').data('refresh-token') || '';
      state.auth.tokenExpires = $('#oauth2-token-expires').text() || '';
    }

    // Get body
    if (selectedBodyType === 'json') {
      state.body.content = $('#body-json-input').val() || '';
    } else if (selectedBodyType === 'xml') {
      state.body.content = $('#body-xml-input').val() || '';
    } else if (selectedBodyType === 'raw') {
      state.body.content = $('#body-raw-input').val() || '';
      state.body.contentType = $('#body-raw-content-type').val() || '';
    } else if (selectedBodyType === 'form') {
      state.body.fields = [];
      $('#form-fields-container .form-field-row').each(function() {
        const key = $(this).find('.form-field-key').val() || '';
        const value = $(this).find('.form-field-value').val() || '';
        if (key || value) {
          state.body.fields.push({ key, value });
        }
      });
    } else if (selectedBodyType === 'schema') {
      state.body.schema = $('#body-schema-input').val() || '';
      state.body.values = getSchemaFormValues ? getSchemaFormValues() : {};
    }

    return state;
  }

  // Check if current form has unsaved changes
  function hasUnsavedChanges() {
    if (!originalRequestState || !currentRequestId) {
      return false;
    }

    const currentState = getCurrentFormState();
    return JSON.stringify(originalRequestState) !== JSON.stringify(currentState);
  }

  // Check if any request has unsaved changes
  function hasAnyUnsavedChanges() {
    // Check current form first
    if (hasUnsavedChanges()) {
      return true;
    }

    // Check stored unsaved data
    return Object.keys(unsavedRequestData).length > 0;
  }

  // Check if a specific request has unsaved changes
  function requestHasUnsavedChanges(requestId) {
    if (requestId === currentRequestId) {
      return hasUnsavedChanges();
    }
    return unsavedRequestData.hasOwnProperty(requestId);
  }

  // Store unsaved data for current request before switching
  function storeUnsavedDataForCurrentRequest() {
    if (currentRequestId && hasUnsavedChanges()) {
      unsavedRequestData[currentRequestId] = getCurrentFormState();
    }
  }

  // Clear unsaved data for a specific request (after saving)
  function clearUnsavedDataForRequest(requestId) {
    delete unsavedRequestData[requestId];
    updateUnsavedBadge();
    renderCollections(); // Re-render to update badges
  }

  // Update unsaved badge visibility
  function updateUnsavedBadge() {
    const $badge = $('#unsaved-badge');
    const $saveBtn = $('#save-request-btn');

    if (hasUnsavedChanges()) {
      $badge.removeClass('hidden');
      $saveBtn.addClass('has-changes');
    } else {
      $badge.addClass('hidden');
      $saveBtn.removeClass('has-changes');
    }

    // Update sidebar request badges
    updateSidebarUnsavedBadges();
  }

  // Update unsaved badges on sidebar requests
  function updateSidebarUnsavedBadges() {
    $('.request-item').each(function() {
      const requestId = $(this).data('request-id');
      const $badge = $(this).find('.request-unsaved-badge');

      if (requestHasUnsavedChanges(requestId)) {
        if ($badge.length === 0) {
          $(this).find('.request-name').after('<span class="request-unsaved-badge"></span>');
        }
      } else {
        $badge.remove();
      }
    });
  }

  // Store original state after loading a request
  function storeOriginalState() {
    originalRequestState = getCurrentFormState();
    updateUnsavedBadge();
  }

  // Clear original state (when creating new request or clearing form)
  function clearOriginalState() {
    originalRequestState = null;
    updateUnsavedBadge();
  }

  // Debounced check for unsaved changes
  const debouncedCheckChanges = debounce(updateUnsavedBadge, 150);

  // Listen for changes on all request input fields
  $(document).on('input change', '#request-name, #method-select, #url-input, .param-key, .param-value, .header-key, .header-value, #auth-type, #auth-basic-username, #auth-basic-password, #auth-bearer-token, #auth-api-key-name, #auth-api-key-value, #auth-api-key-location, #auth-oauth2-grant-type, #auth-oauth2-token-url, #auth-oauth2-auth-url, #auth-oauth2-client-id, #auth-oauth2-client-secret, #auth-oauth2-redirect-uri, #auth-oauth2-scope, #auth-oauth2-username, #auth-oauth2-password, #body-json-input, #body-xml-input, #body-raw-input, #body-raw-content-type, .form-field-key, .form-field-value, #body-schema-input, .schema-field-input', function() {
    debouncedCheckChanges();
  });

  function loadRequestIntoForm(request) {
    // Show request name bar
    $('#request-name-bar').removeClass('hidden');

    // Check if there's unsaved data for this request
    const unsavedState = unsavedRequestData[request.id];

    if (unsavedState) {
      // Load unsaved state
      loadFormState(unsavedState);
      // Clear from unsaved data since it's now in the form
      delete unsavedRequestData[request.id];
    } else {
      // Load saved request data
      loadFormState({
        name: request.name,
        method: request.method,
        url: request.url,
        params: request.params || [],
        headers: request.headers || [],
        auth: request.auth || { type: 'none' },
        body: request.body || { type: 'none', content: '' }
      });
    }

    // Trigger variable detection after loading request
    updateVariablesWithDetected();

    // Store original state (from saved request, not unsaved changes)
    // This ensures we compare against the last saved version
    setTimeout(function() {
      originalRequestState = {
        name: request.name,
        method: request.method,
        url: request.url,
        params: request.params || [],
        headers: request.headers || [],
        auth: request.auth || { type: 'none' },
        body: request.body || { type: 'none', content: '' }
      };
      updateUnsavedBadge();
    }, 50);
  }

  // Load a form state object into the form fields
  function loadFormState(state) {
    $('#request-name').val(state.name || '');
    $('#method-select').val(state.method || 'GET');
    $('#url-input').val(state.url || '');

    // Load params
    $('#params-container').empty();
    if (state.params && state.params.length > 0) {
      state.params.forEach(function(param) {
        addKeyValueRow('#params-container', 'param', param.key, param.value);
      });
    } else {
      addKeyValueRow('#params-container', 'param');
    }

    // Load headers
    $('#headers-container').empty();
    if (state.headers && state.headers.length > 0) {
      state.headers.forEach(function(header) {
        addKeyValueRow('#headers-container', 'header', header.key, header.value);
      });
    } else {
      addKeyValueRow('#headers-container', 'header');
    }

    // Load auth
    const auth = state.auth || { type: 'none' };
    $('#auth-type').val(auth.type).trigger('change');
    if (auth.type === 'basic') {
      $('#auth-basic-username').val(auth.username || '');
      $('#auth-basic-password').val(auth.password || '');
    } else if (auth.type === 'bearer') {
      $('#auth-bearer-token').val(auth.token || '');
    } else if (auth.type === 'api-key') {
      $('#auth-api-key-name').val(auth.keyName || '');
      $('#auth-api-key-value').val(auth.keyValue || '');
      $('#auth-api-key-location').val(auth.location || 'header');
    } else if (auth.type === 'oauth2') {
      $('#auth-oauth2-grant-type').val(auth.grantType || 'authorization_code').trigger('change');
      $('#auth-oauth2-token-url').val(auth.tokenUrl || '');
      $('#auth-oauth2-auth-url').val(auth.authUrl || '');
      $('#auth-oauth2-client-id').val(auth.clientId || '');
      $('#auth-oauth2-client-secret').val(auth.clientSecret || '');
      $('#auth-oauth2-redirect-uri').val(auth.redirectUri || '');
      $('#auth-oauth2-scope').val(auth.scope || '');
      $('#auth-oauth2-username').val(auth.username || '');
      $('#auth-oauth2-password').val(auth.password || '');
      $('#auth-oauth2-access-token').val(auth.accessToken || '');

      if (auth.refreshToken) {
        $('#auth-oauth2-access-token').data('refresh-token', auth.refreshToken);
      }

      if (auth.tokenExpires) {
        $('#oauth2-token-expires').text(auth.tokenExpires);
      }

      if (auth.accessToken) {
        $('#oauth2-token-display').removeClass('hidden');
      }
    }

    // Load body
    const body = state.body || { type: 'none', content: '' };
    selectedBodyType = body.type;
    $('.body-type-btn').removeClass('active');
    $(`.body-type-btn[data-body-type="${body.type}"]`).addClass('active');
    $('.body-content').addClass('hidden');
    $(`#body-${body.type}`).removeClass('hidden');

    if (body.type === 'json') {
      $('#body-json-input').val(body.content || '');
    } else if (body.type === 'xml') {
      $('#body-xml-input').val(body.content || '');
    } else if (body.type === 'raw') {
      $('#body-raw-input').val(body.content || '');
      $('#body-raw-content-type').val(body.contentType || '');
    } else if (body.type === 'form') {
      $('#form-fields-container').empty();
      if (body.fields && body.fields.length > 0) {
        body.fields.forEach(function(field) {
          addKeyValueRow('#form-fields-container', 'form-field', field.key, field.value);
        });
      } else {
        addKeyValueRow('#form-fields-container', 'form-field');
      }
    } else if (body.type === 'schema') {
      $('#body-schema-input').val(body.schema || '');
      currentSchemaValues = body.values || {};

      // Re-render the form if there's a schema
      if (body.schema) {
        renderSchemaForm();
      }

      // Reset to schema editor tab
      $('.schema-tab').removeClass('active');
      $('.schema-tab[data-schema-tab="schema"]').addClass('active');
      $('.schema-tab-content').addClass('hidden');
      $('#schema-editor-tab').removeClass('hidden');
    }
  }

  function saveRequestFromForm(request) {
    request.name = $('#request-name').val().trim() || 'Untitled Request';
    request.method = $('#method-select').val();
    request.url = $('#url-input').val().trim();

    // Save params
    request.params = [];
    $('#params-container .param-row').each(function() {
      const key = $(this).find('.param-key').val().trim();
      const value = $(this).find('.param-value').val().trim();
      if (key) {
        request.params.push({ key, value });
      }
    });

    // Save headers
    request.headers = [];
    $('#headers-container .header-row').each(function() {
      const key = $(this).find('.header-key').val().trim();
      const value = $(this).find('.header-value').val().trim();
      if (key) {
        request.headers.push({ key, value });
      }
    });

    // Save auth
    const authType = $('#auth-type').val();
    request.auth = { type: authType };
    if (authType === 'basic') {
      request.auth.username = $('#auth-basic-username').val();
      request.auth.password = $('#auth-basic-password').val();
    } else if (authType === 'bearer') {
      request.auth.token = $('#auth-bearer-token').val();
    } else if (authType === 'api-key') {
      request.auth.keyName = $('#auth-api-key-name').val();
      request.auth.keyValue = $('#auth-api-key-value').val();
      request.auth.location = $('#auth-api-key-location').val();
    } else if (authType === 'oauth2') {
      request.auth.grantType = $('#auth-oauth2-grant-type').val();
      request.auth.tokenUrl = $('#auth-oauth2-token-url').val();
      request.auth.authUrl = $('#auth-oauth2-auth-url').val();
      request.auth.clientId = $('#auth-oauth2-client-id').val();
      request.auth.clientSecret = $('#auth-oauth2-client-secret').val();
      request.auth.redirectUri = $('#auth-oauth2-redirect-uri').val();
      request.auth.scope = $('#auth-oauth2-scope').val();
      request.auth.username = $('#auth-oauth2-username').val();
      request.auth.password = $('#auth-oauth2-password').val();
      request.auth.accessToken = $('#auth-oauth2-access-token').val();
      request.auth.refreshToken = $('#auth-oauth2-access-token').data('refresh-token') || '';
      request.auth.tokenExpires = $('#oauth2-token-expires').text();
    }

    // Save body
    request.body = { type: selectedBodyType };
    if (selectedBodyType === 'json') {
      request.body.content = $('#body-json-input').val();
    } else if (selectedBodyType === 'xml') {
      request.body.content = $('#body-xml-input').val();
    } else if (selectedBodyType === 'raw') {
      request.body.content = $('#body-raw-input').val();
      request.body.contentType = $('#body-raw-content-type').val();
    } else if (selectedBodyType === 'form') {
      request.body.fields = [];
      $('#form-fields-container .form-field-row').each(function() {
        const key = $(this).find('.form-field-key').val().trim();
        const value = $(this).find('.form-field-value').val().trim();
        if (key) {
          request.body.fields.push({ key, value });
        }
      });
    } else if (selectedBodyType === 'schema') {
      request.body.schema = $('#body-schema-input').val();
      request.body.values = getSchemaFormValues();
    }
  }

  function clearRequestForm() {
    $('#request-name-bar').addClass('hidden');
    $('#request-name').val('');
    $('#method-select').val('GET');
    $('#url-input').val('');

    $('#params-container').empty();
    addKeyValueRow('#params-container', 'param');

    $('#headers-container').empty();
    addKeyValueRow('#headers-container', 'header');

    $('#auth-type').val('none').trigger('change');

    selectedBodyType = 'none';
    $('.body-type-btn').removeClass('active');
    $('.body-type-btn[data-body-type="none"]').addClass('active');
    $('.body-content').addClass('hidden');
    $('#body-none').removeClass('hidden');

    $('#form-fields-container').empty();
    addKeyValueRow('#form-fields-container', 'form-field');

    // Clear schema form
    $('#body-schema-input').val('');
    currentSchemaValues = {};
    $('#schema-form-preview').html('<p class="text-slate-500 text-sm text-center py-6">Define a schema and click "Render Form" to preview</p>');
    $('.schema-tab').removeClass('active');
    $('.schema-tab[data-schema-tab="schema"]').addClass('active');
    $('.schema-tab-content').addClass('hidden');
    $('#schema-editor-tab').removeClass('hidden');

    hideResponse();
    hideError();

    // Trigger variable detection after clearing
    updateVariablesWithDetected();

    // Clear dirty state tracking
    clearOriginalState();
  }

  // Export collections
  $('#export-btn').on('click', function() {
    if (collections.length === 0) {
      showError('No collections to export');
      return;
    }

    const dataStr = JSON.stringify(collections, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patchman-collections.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import collections
  $('#import-btn').on('click', function() {
    $('#import-file-input').click();
  });

  $('#import-file-input').on('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) {
          throw new Error('Invalid format');
        }

        // Validate and regenerate IDs to avoid conflicts
        imported.forEach(function(collection) {
          collection.id = generateId();
          (collection.requests || []).forEach(function(request) {
            request.id = generateId();
          });
        });

        collections = collections.concat(imported);
        saveCollections();
      } catch (err) {
        showError('Failed to import: Invalid JSON file');
      }
    };
    reader.readAsText(file);

    // Reset input
    $(this).val('');
  });

  // History management functions
  function loadHistory() {
    chrome.storage.local.get(['patchman_history'], function(result) {
      requestHistory = result.patchman_history || [];
      renderHistory();
    });
  }

  function saveHistory() {
    chrome.storage.local.set({ patchman_history: requestHistory }, function() {
      renderHistory();
    });
  }

  function addToHistory(requestData, responseData) {
    const historyItem = {
      id: generateId(),
      timestamp: Date.now(),
      method: requestData.method,
      url: requestData.url,
      params: requestData.params,
      headers: requestData.headers,
      auth: requestData.auth,
      body: requestData.body,
      response: {
        status: responseData.status,
        headers: responseData.headers,
        body: responseData.body,
        duration: responseData.duration
      }
    };

    // Add to beginning of array
    requestHistory.unshift(historyItem);

    // Limit history size
    if (requestHistory.length > MAX_HISTORY_ITEMS) {
      requestHistory = requestHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    saveHistory();
  }

  function renderHistory() {
    const $list = $('#history-list');
    const $empty = $('#empty-history');

    $list.find('.history-item').remove();

    if (requestHistory.length === 0) {
      $empty.removeClass('hidden');
      return;
    }

    $empty.addClass('hidden');

    requestHistory.forEach(function(item) {
      const timeAgo = formatTimeAgo(item.timestamp);
      const urlDisplay = truncateUrl(item.url);
      // Support both old format (item.status) and new format (item.response.status)
      const status = item.response ? item.response.status : item.status;
      let statusClass = 'warning';
      if (status >= 200 && status < 300) {
        statusClass = 'success';
      } else if (status >= 400 || status === 0) {
        statusClass = 'error';
      }

      const $item = $(`
        <div class="history-item" data-history-id="${item.id}">
          <span class="history-item-method ${item.method}">${item.method}</span>
          <div class="history-item-info">
            <div class="history-item-url" title="${escapeHtml(item.url)}">${escapeHtml(urlDisplay)}</div>
            <div class="history-item-time">${timeAgo}</div>
          </div>
          <span class="history-item-status ${statusClass}">${status || 'ERR'}</span>
          <button class="history-item-delete" title="Remove">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `);

      $list.append($item);
    });
  }

  function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';

    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  function truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      let display = urlObj.pathname;
      if (urlObj.search) {
        display += urlObj.search.length > 20 ? urlObj.search.substring(0, 20) + '...' : urlObj.search;
      }
      return display || '/';
    } catch (e) {
      return url.length > 40 ? url.substring(0, 40) + '...' : url;
    }
  }

  // Load history item into form
  $(document).on('click', '.history-item', function(e) {
    if ($(e.target).closest('.history-item-delete').length) return;

    const historyId = $(this).data('history-id');
    const item = requestHistory.find(h => h.id === historyId);

    if (item) {
      // Store unsaved data for current request before switching
      storeUnsavedDataForCurrentRequest();

      loadHistoryIntoForm(item);
      $('.history-item').removeClass('active');
      $(this).addClass('active');
    }
  });

  function loadHistoryIntoForm(item) {
    // Clear current request context (no longer editing a saved request)
    currentRequestId = null;
    currentCollectionId = null;
    $('#request-name-bar').addClass('hidden');
    $('.request-item').removeClass('active');

    // Set method and URL
    $('#method-select').val(item.method);
    $('#url-input').val(item.url);

    // Load params
    $('#params-container').empty();
    if (item.params && item.params.length > 0) {
      item.params.forEach(function(param) {
        addKeyValueRow('#params-container', 'param', param.key, param.value);
      });
    } else {
      addKeyValueRow('#params-container', 'param');
    }

    // Load headers
    $('#headers-container').empty();
    if (item.headers && item.headers.length > 0) {
      item.headers.forEach(function(header) {
        addKeyValueRow('#headers-container', 'header', header.key, header.value);
      });
    } else {
      addKeyValueRow('#headers-container', 'header');
    }

    // Load auth
    const auth = item.auth || { type: 'none' };
    $('#auth-type').val(auth.type).trigger('change');
    if (auth.type === 'basic') {
      $('#auth-basic-username').val(auth.username || '');
      $('#auth-basic-password').val(auth.password || '');
    } else if (auth.type === 'bearer') {
      $('#auth-bearer-token').val(auth.token || '');
    } else if (auth.type === 'api-key') {
      $('#auth-api-key-name').val(auth.keyName || '');
      $('#auth-api-key-value').val(auth.keyValue || '');
      $('#auth-api-key-location').val(auth.location || 'header');
    }

    // Load body
    const body = item.body || { type: 'none', content: '' };
    selectedBodyType = body.type;
    $('.body-type-btn').removeClass('active');
    $(`.body-type-btn[data-body-type="${body.type}"]`).addClass('active');
    $('.body-content').addClass('hidden');
    $(`#body-${body.type}`).removeClass('hidden');

    if (body.type === 'json') {
      $('#body-json-input').val(body.content || '');
    } else if (body.type === 'xml') {
      $('#body-xml-input').val(body.content || '');
    } else if (body.type === 'raw') {
      $('#body-raw-input').val(body.content || '');
      $('#body-raw-content-type').val(body.contentType || '');
    } else if (body.type === 'form') {
      $('#form-fields-container').empty();
      if (body.fields && body.fields.length > 0) {
        body.fields.forEach(function(field) {
          addKeyValueRow('#form-fields-container', 'form-field', field.key, field.value);
        });
      } else {
        addKeyValueRow('#form-fields-container', 'form-field');
      }
    } else if (body.type === 'schema') {
      $('#body-schema-input').val(body.schema || '');
      currentSchemaValues = body.values || {};
      if (body.schema) {
        renderSchemaForm();
      }
    }

    // Trigger variable detection
    updateVariablesWithDetected();

    // Show the saved response if available
    hideError();
    if (item.response && item.response.status !== undefined) {
      showResponse(
        item.response.status,
        item.response.body || '',
        item.response.headers || '',
        item.response.duration || 0
      );
    } else if (item.status !== undefined) {
      // Support old format
      hideResponse();
    } else {
      hideResponse();
    }
  }

  // Delete history item
  $(document).on('click', '.history-item-delete', function(e) {
    e.stopPropagation();
    const $item = $(this).closest('.history-item');
    const historyId = $item.data('history-id');

    requestHistory = requestHistory.filter(h => h.id !== historyId);
    saveHistory();
  });

  // Clear all history
  $('#clear-history-btn').on('click', function(e) {
    e.stopPropagation();

    if (requestHistory.length === 0) return;

    showConfirmModal(
      'Clear History',
      'Are you sure you want to clear all request history?',
      function() {
        requestHistory = [];
        saveHistory();
      }
    );
  });

  // Schema form tab switching
  $('.schema-tab').on('click', function() {
    const tab = $(this).data('schema-tab');
    $('.schema-tab').removeClass('active');
    $(this).addClass('active');
    $('.schema-tab-content').addClass('hidden');
    $(`#schema-${tab === 'schema' ? 'editor' : 'form'}-tab`).removeClass('hidden');
  });

  // Render schema form
  let currentSchemaValues = {};

  $('#render-schema-btn').on('click', function() {
    renderSchemaForm();
  });

  function renderSchemaForm() {
    const schemaText = $('#body-schema-input').val().trim();

    if (!schemaText) {
      $('#schema-form-preview').html('<p class="text-slate-500 text-sm text-center py-6">Define a schema and click "Render Form" to preview</p>');
      return;
    }

    try {
      const schema = JSON.parse(schemaText);

      if (!Array.isArray(schema)) {
        throw new Error('Schema must be an array of field definitions');
      }

      const $preview = $('#schema-form-preview');
      $preview.empty();

      schema.forEach(function(field) {
        const $field = renderSchemaField(field);
        $preview.append($field);
      });

      // Switch to form preview tab
      $('.schema-tab').removeClass('active');
      $('.schema-tab[data-schema-tab="form"]').addClass('active');
      $('.schema-tab-content').addClass('hidden');
      $('#schema-form-tab').removeClass('hidden');

    } catch (e) {
      showError('Invalid schema JSON: ' + e.message);
    }
  }

  function renderSchemaField(field) {
    const name = field.name || 'field_' + generateId();
    const label = field.label || name;
    const help = field.help || '';
    const required = field.required || false;
    const type = field.type || 'text';
    const defaultValue = currentSchemaValues[name] !== undefined ? currentSchemaValues[name] : (field.default !== undefined ? field.default : '');

    let $field = $(`
      <div class="schema-field" data-field-name="${escapeHtml(name)}">
        <div class="schema-field-label">
          <span>${escapeHtml(label)}</span>
          ${required ? '<span class="schema-field-required">*</span>' : ''}
        </div>
        <div class="schema-field-control"></div>
        ${help ? `<div class="schema-field-help">${escapeHtml(help)}</div>` : ''}
      </div>
    `);

    const $control = $field.find('.schema-field-control');

    switch (type) {
      case 'text':
        $control.html(renderTextField(field, defaultValue));
        break;

      case 'number':
        $control.html(renderNumberField(field, defaultValue));
        break;

      case 'textarea':
        $control.html(renderTextareaField(field, defaultValue));
        break;

      case 'choice':
        $control.html(renderChoiceField(field, defaultValue));
        break;

      case 'slider':
        $control.html(renderSliderField(field, defaultValue));
        break;

      case 'button_group':
        $control.html(renderButtonGroupField(field, defaultValue));
        break;

      case 'toggle':
      case 'boolean':
        $control.html(renderToggleField(field, defaultValue));
        break;

      case 'email':
        $control.html(renderTextField({ ...field, inputType: 'email' }, defaultValue));
        break;

      case 'password':
        $control.html(renderTextField({ ...field, inputType: 'password' }, defaultValue));
        break;

      case 'url':
        $control.html(renderTextField({ ...field, inputType: 'url' }, defaultValue));
        break;

      case 'date':
        $control.html(renderTextField({ ...field, inputType: 'date' }, defaultValue));
        break;

      case 'datetime':
        $control.html(renderTextField({ ...field, inputType: 'datetime-local' }, defaultValue));
        break;

      case 'time':
        $control.html(renderTextField({ ...field, inputType: 'time' }, defaultValue));
        break;

      case 'color':
        $control.html(renderTextField({ ...field, inputType: 'color' }, defaultValue));
        break;

      default:
        $control.html(renderTextField(field, defaultValue));
    }

    return $field;
  }

  function renderTextField(field, value) {
    const inputType = field.inputType || 'text';
    const placeholder = field.placeholder || '';
    const min = field.min !== undefined ? `minlength="${field.min}"` : '';
    const max = field.max !== undefined ? `maxlength="${field.max}"` : '';

    return `<input type="${inputType}" class="schema-field-input" data-field-name="${escapeHtml(field.name)}"
      placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" ${min} ${max}>`;
  }

  function renderNumberField(field, value) {
    const min = field.min !== undefined ? `min="${field.min}"` : '';
    const max = field.max !== undefined ? `max="${field.max}"` : '';
    const step = field.step !== undefined ? `step="${field.step}"` : '';
    const placeholder = field.placeholder || '';

    return `<input type="number" class="schema-field-input" data-field-name="${escapeHtml(field.name)}"
      placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" ${min} ${max} ${step}>`;
  }

  function renderTextareaField(field, value) {
    const placeholder = field.placeholder || '';
    const rows = field.rows || 4;

    return `<textarea class="schema-field-input schema-field-textarea" data-field-name="${escapeHtml(field.name)}"
      placeholder="${escapeHtml(placeholder)}" rows="${rows}">${escapeHtml(value)}</textarea>`;
  }

  function renderChoiceField(field, value) {
    const options = field.options || [];
    const multiple = field.multiple || false;
    const displayType = field.display || 'select'; // 'select' or 'radio_checkbox'

    if (displayType === 'select') {
      if (multiple) {
        return renderMultiSelectField(field, value);
      } else {
        let html = `<select class="schema-field-input schema-field-select" data-field-name="${escapeHtml(field.name)}">`;
        html += `<option value="">Select...</option>`;
        options.forEach(function(opt) {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const selected = value === optValue ? 'selected' : '';
          html += `<option value="${escapeHtml(optValue)}" ${selected}>${escapeHtml(optLabel)}</option>`;
        });
        html += '</select>';
        return html;
      }
    } else {
      // radio_checkbox
      if (multiple) {
        return renderCheckboxGroup(field, value);
      } else {
        return renderRadioGroup(field, value);
      }
    }
  }

  function renderRadioGroup(field, value) {
    const options = field.options || [];
    const horizontal = field.horizontal || false;
    let html = `<div class="schema-radio-group ${horizontal ? 'horizontal' : ''}" data-field-name="${escapeHtml(field.name)}">`;

    options.forEach(function(opt, index) {
      const optValue = typeof opt === 'object' ? opt.value : opt;
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      const checked = value === optValue ? 'checked' : '';
      const id = `${field.name}_${index}`;

      html += `
        <div class="schema-radio-item">
          <input type="radio" id="${id}" name="${escapeHtml(field.name)}" value="${escapeHtml(optValue)}" ${checked}>
          <label for="${id}">${escapeHtml(optLabel)}</label>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  function renderCheckboxGroup(field, value) {
    const options = field.options || [];
    const horizontal = field.horizontal || false;
    const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
    let html = `<div class="schema-checkbox-group ${horizontal ? 'horizontal' : ''}" data-field-name="${escapeHtml(field.name)}">`;

    options.forEach(function(opt, index) {
      const optValue = typeof opt === 'object' ? opt.value : opt;
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      const checked = selectedValues.includes(optValue) ? 'checked' : '';
      const id = `${field.name}_${index}`;

      html += `
        <div class="schema-checkbox-item">
          <input type="checkbox" id="${id}" name="${escapeHtml(field.name)}" value="${escapeHtml(optValue)}" ${checked}>
          <label for="${id}">${escapeHtml(optLabel)}</label>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  function renderMultiSelectField(field, value) {
    const options = field.options || [];
    const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
    const placeholder = field.placeholder || 'Select options...';

    let tagsHtml = '';
    if (selectedValues.length > 0) {
      selectedValues.forEach(function(val) {
        const opt = options.find(o => (typeof o === 'object' ? o.value : o) === val);
        const label = opt ? (typeof opt === 'object' ? opt.label : opt) : val;
        tagsHtml += `<span class="schema-multiselect-tag" data-value="${escapeHtml(val)}">${escapeHtml(label)}<span class="schema-multiselect-tag-remove">&times;</span></span>`;
      });
    }

    let optionsHtml = '';
    options.forEach(function(opt) {
      const optValue = typeof opt === 'object' ? opt.value : opt;
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      const selected = selectedValues.includes(optValue) ? 'selected' : '';
      optionsHtml += `<div class="schema-multiselect-option ${selected}" data-value="${escapeHtml(optValue)}">${escapeHtml(optLabel)}</div>`;
    });

    return `
      <div class="schema-multiselect" data-field-name="${escapeHtml(field.name)}">
        <div class="schema-multiselect-trigger">
          <div class="schema-multiselect-tags">
            ${tagsHtml || `<span class="schema-multiselect-placeholder">${escapeHtml(placeholder)}</span>`}
          </div>
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        <div class="schema-multiselect-dropdown">
          ${optionsHtml}
        </div>
      </div>
    `;
  }

  function renderSliderField(field, value) {
    const min = field.min !== undefined ? field.min : 0;
    const max = field.max !== undefined ? field.max : 100;
    const step = field.step !== undefined ? field.step : 1;
    const currentValue = value !== '' ? value : (field.default !== undefined ? field.default : min);

    return `
      <div class="schema-slider-container">
        <input type="range" class="schema-slider" data-field-name="${escapeHtml(field.name)}"
          min="${min}" max="${max}" step="${step}" value="${currentValue}">
        <span class="schema-slider-value">${currentValue}</span>
      </div>
    `;
  }

  function renderButtonGroupField(field, value) {
    const options = field.options || [];
    const multiple = field.multiple || false;
    const selectedValues = multiple ? (Array.isArray(value) ? value : (value ? [value] : [])) : [value];

    let html = `<div class="schema-button-group" data-field-name="${escapeHtml(field.name)}" data-multiple="${multiple}">`;

    options.forEach(function(opt) {
      const optValue = typeof opt === 'object' ? opt.value : opt;
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      const active = selectedValues.includes(optValue) ? 'active' : '';
      html += `<button type="button" class="schema-button-group-btn ${active}" data-value="${escapeHtml(optValue)}">${escapeHtml(optLabel)}</button>`;
    });

    html += '</div>';
    return html;
  }

  function renderToggleField(field, value) {
    const active = value === true || value === 'true' || value === 1 || value === '1';
    const onLabel = field.onLabel || 'On';
    const offLabel = field.offLabel || 'Off';

    return `
      <div class="schema-toggle-container">
        <div class="schema-toggle ${active ? 'active' : ''}" data-field-name="${escapeHtml(field.name)}"></div>
        <span class="schema-toggle-label">${active ? escapeHtml(onLabel) : escapeHtml(offLabel)}</span>
      </div>
    `;
  }

  // Schema form event handlers
  $(document).on('input', '.schema-slider', function() {
    $(this).siblings('.schema-slider-value').text($(this).val());
  });

  $(document).on('click', '.schema-toggle', function() {
    $(this).toggleClass('active');
    const field = $(this).closest('.schema-field').data('field-name');
    const label = $(this).siblings('.schema-toggle-label');
    // Try to get the original field definition for labels
    const isActive = $(this).hasClass('active');
    label.text(isActive ? 'On' : 'Off');
  });

  $(document).on('click', '.schema-button-group-btn', function() {
    const $group = $(this).parent();
    const multiple = $group.data('multiple');

    if (multiple) {
      $(this).toggleClass('active');
    } else {
      $group.find('.schema-button-group-btn').removeClass('active');
      $(this).addClass('active');
    }
  });

  $(document).on('click', '.schema-multiselect-trigger', function(e) {
    const $multiselect = $(this).parent();
    $multiselect.toggleClass('open');
    e.stopPropagation();
  });

  $(document).on('click', '.schema-multiselect-option', function() {
    const $option = $(this);
    const $multiselect = $option.closest('.schema-multiselect');
    const value = $option.data('value');
    const label = $option.text();

    $option.toggleClass('selected');

    const $tags = $multiselect.find('.schema-multiselect-tags');
    $tags.find('.schema-multiselect-placeholder').remove();

    if ($option.hasClass('selected')) {
      $tags.append(`<span class="schema-multiselect-tag" data-value="${escapeHtml(value)}">${escapeHtml(label)}<span class="schema-multiselect-tag-remove">&times;</span></span>`);
    } else {
      $tags.find(`.schema-multiselect-tag[data-value="${value}"]`).remove();
    }

    if ($tags.find('.schema-multiselect-tag').length === 0) {
      $tags.append('<span class="schema-multiselect-placeholder">Select options...</span>');
    }
  });

  $(document).on('click', '.schema-multiselect-tag-remove', function(e) {
    e.stopPropagation();
    const $tag = $(this).parent();
    const $multiselect = $tag.closest('.schema-multiselect');
    const value = $tag.data('value');

    $multiselect.find(`.schema-multiselect-option[data-value="${value}"]`).removeClass('selected');
    $tag.remove();

    const $tags = $multiselect.find('.schema-multiselect-tags');
    if ($tags.find('.schema-multiselect-tag').length === 0) {
      $tags.append('<span class="schema-multiselect-placeholder">Select options...</span>');
    }
  });

  // Close multiselect when clicking outside
  $(document).on('click', function() {
    $('.schema-multiselect').removeClass('open');
  });

  // Get schema form values
  function getSchemaFormValues() {
    const values = {};

    $('#schema-form-preview .schema-field').each(function() {
      const fieldName = $(this).data('field-name');
      const $control = $(this).find('.schema-field-control');

      // Text, number, textarea, select
      const $input = $control.find('input.schema-field-input, textarea.schema-field-input, select.schema-field-input');
      if ($input.length) {
        values[fieldName] = $input.val();
        return;
      }

      // Radio group
      const $radioGroup = $control.find('.schema-radio-group');
      if ($radioGroup.length) {
        values[fieldName] = $radioGroup.find('input:checked').val() || '';
        return;
      }

      // Checkbox group
      const $checkboxGroup = $control.find('.schema-checkbox-group');
      if ($checkboxGroup.length) {
        values[fieldName] = [];
        $checkboxGroup.find('input:checked').each(function() {
          values[fieldName].push($(this).val());
        });
        return;
      }

      // Multi-select
      const $multiselect = $control.find('.schema-multiselect');
      if ($multiselect.length) {
        values[fieldName] = [];
        $multiselect.find('.schema-multiselect-tag').each(function() {
          values[fieldName].push($(this).data('value'));
        });
        return;
      }

      // Slider
      const $slider = $control.find('.schema-slider');
      if ($slider.length) {
        values[fieldName] = parseFloat($slider.val());
        return;
      }

      // Button group
      const $buttonGroup = $control.find('.schema-button-group');
      if ($buttonGroup.length) {
        const multiple = $buttonGroup.data('multiple');
        if (multiple) {
          values[fieldName] = [];
          $buttonGroup.find('.schema-button-group-btn.active').each(function() {
            values[fieldName].push($(this).data('value'));
          });
        } else {
          values[fieldName] = $buttonGroup.find('.schema-button-group-btn.active').data('value') || '';
        }
        return;
      }

      // Toggle
      const $toggle = $control.find('.schema-toggle');
      if ($toggle.length) {
        values[fieldName] = $toggle.hasClass('active');
        return;
      }
    });

    currentSchemaValues = values;
    return values;
  }

  // Request tab switching
  $('.request-tab').on('click', function() {
    const tab = $(this).data('request-tab');
    $('.request-tab').removeClass('active');
    $(this).addClass('active');
    $('.request-tab-content').addClass('hidden');
    $(`#${tab}-tab`).removeClass('hidden');
  });

  // Response tab switching
  $('.tab-btn').on('click', function() {
    const tab = $(this).data('tab');
    $('.tab-btn').removeClass('active bg-slate-700 text-white').addClass('bg-slate-800 text-slate-400');
    $(this).addClass('active bg-slate-700 text-white').removeClass('bg-slate-800 text-slate-400');
    $('.tab-content').addClass('hidden');
    $(`#response-${tab}-tab`).removeClass('hidden');
  });

  // Body view switching (Tree/Raw)
  $('.body-view-btn').on('click', function() {
    const view = $(this).data('body-view');
    $('.body-view-btn').removeClass('active bg-slate-700 text-white').addClass('bg-slate-800 text-slate-400');
    $(this).addClass('active bg-slate-700 text-white').removeClass('bg-slate-800 text-slate-400');

    if (view === 'tree') {
      $('#response-tree-view').removeClass('hidden');
      $('#response-body').addClass('hidden');
    } else {
      $('#response-tree-view').addClass('hidden');
      $('#response-body').removeClass('hidden');
    }
  });

  // Auth type switching
  $('#auth-type').on('change', function() {
    const authType = $(this).val();
    $('.auth-fields').addClass('hidden');

    if (authType !== 'none') {
      $(`#auth-${authType}`).removeClass('hidden');
    }
  });

  // OAuth2 grant type switching
  $('#auth-oauth2-grant-type').on('change', function() {
    const grantType = $(this).val();

    // Hide all optional fields first
    $('#oauth2-auth-url-field').addClass('hidden');
    $('#oauth2-redirect-uri-field').addClass('hidden');
    $('#oauth2-username-field').addClass('hidden');
    $('#oauth2-password-field').addClass('hidden');

    // Show fields based on grant type
    if (grantType === 'authorization_code' || grantType === 'implicit') {
      $('#oauth2-auth-url-field').removeClass('hidden');
      $('#oauth2-redirect-uri-field').removeClass('hidden');
    } else if (grantType === 'password') {
      $('#oauth2-username-field').removeClass('hidden');
      $('#oauth2-password-field').removeClass('hidden');
    }
  });

  // OAuth2 Get Token button
  $('#oauth2-get-token-btn').on('click', async function() {
    const grantType = $('#auth-oauth2-grant-type').val();
    const tokenUrl = interpolateVariables($('#auth-oauth2-token-url').val().trim());
    const clientId = interpolateVariables($('#auth-oauth2-client-id').val().trim());
    const clientSecret = interpolateVariables($('#auth-oauth2-client-secret').val().trim());
    const scope = interpolateVariables($('#auth-oauth2-scope').val().trim());

    if (!tokenUrl || !clientId) {
      showError('Token URL and Client ID are required');
      return;
    }

    try {
      let tokenData;

      if (grantType === 'client_credentials') {
        tokenData = await getOAuth2TokenClientCredentials(tokenUrl, clientId, clientSecret, scope);
      } else if (grantType === 'password') {
        const username = interpolateVariables($('#auth-oauth2-username').val().trim());
        const password = interpolateVariables($('#auth-oauth2-password').val().trim());

        if (!username || !password) {
          showError('Username and Password are required for Password grant');
          return;
        }

        tokenData = await getOAuth2TokenPassword(tokenUrl, clientId, clientSecret, username, password, scope);
      } else if (grantType === 'authorization_code' || grantType === 'implicit') {
        const authUrl = interpolateVariables($('#auth-oauth2-auth-url').val().trim());
        const redirectUri = interpolateVariables($('#auth-oauth2-redirect-uri').val().trim());

        if (!authUrl) {
          showError('Authorization URL is required for Authorization Code grant');
          return;
        }

        tokenData = await getOAuth2TokenAuthorizationCode(authUrl, tokenUrl, clientId, clientSecret, redirectUri, scope, grantType);
      }

      if (tokenData && tokenData.access_token) {
        $('#auth-oauth2-access-token').val(tokenData.access_token);
        $('#oauth2-token-display').removeClass('hidden');

        // Calculate expiration time
        if (tokenData.expires_in) {
          const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
          $('#oauth2-token-expires').text(expiresAt.toLocaleString());
        } else {
          $('#oauth2-token-expires').text('N/A');
        }

        // Store refresh token if available
        if (tokenData.refresh_token) {
          $('#auth-oauth2-access-token').data('refresh-token', tokenData.refresh_token);
        }

        showSuccess('Access token obtained successfully!');
      }
    } catch (error) {
      showError(`Failed to obtain access token: ${error.message}`);
    }
  });

  // OAuth2 Clear Token button
  $('#oauth2-clear-token-btn').on('click', function() {
    $('#auth-oauth2-access-token').val('').removeData('refresh-token');
    $('#oauth2-token-expires').text('N/A');
    $('#oauth2-token-display').addClass('hidden');
  });

  // Body type switching
  $('.body-type-btn').on('click', function() {
    const bodyType = $(this).data('body-type');
    selectedBodyType = bodyType;
    $('.body-type-btn').removeClass('active');
    $(this).addClass('active');
    $('.body-content').addClass('hidden');
    $(`#body-${bodyType}`).removeClass('hidden');
    debouncedCheckChanges(); // Check for unsaved changes
  });

  // Add parameter row
  $('#add-param-btn').on('click', function() {
    addKeyValueRow('#params-container', 'param');
    debouncedCheckChanges();
  });

  // Add header row
  $('#add-header-btn').on('click', function() {
    addKeyValueRow('#headers-container', 'header');
    debouncedCheckChanges();
  });

  // Add form field row
  $('#add-form-field-btn').on('click', function() {
    addKeyValueRow('#form-fields-container', 'form-field');
    debouncedCheckChanges();
  });

  // Remove row handlers (delegated)
  $(document).on('click', '.remove-param-btn', function() {
    removeRow($(this), '#params-container', 'param');
    debouncedCheckChanges();
  });

  $(document).on('click', '.remove-header-btn', function() {
    removeRow($(this), '#headers-container', 'header');
    debouncedCheckChanges();
  });

  $(document).on('click', '.remove-form-field-btn', function() {
    removeRow($(this), '#form-fields-container', 'form-field');
    debouncedCheckChanges();
  });

  function addKeyValueRow(container, prefix, key = '', value = '') {
    const row = `
      <div class="${prefix}-row flex gap-2 items-center">
        <input type="text" placeholder="Key" class="${prefix}-key flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(key)}">
        <input type="text" placeholder="Value" class="${prefix}-value flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(value)}">
        <button class="remove-${prefix}-btn p-1.5 text-slate-400 hover:text-red-400 transition-all" title="Remove">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
    $(container).append(row);
  }

  function removeRow($btn, container, prefix) {
    const $rows = $(`${container} .${prefix}-row`);

    if ($rows.length > 1) {
      $btn.closest(`.${prefix}-row`).remove();
    } else {
      $btn.closest(`.${prefix}-row`).find('input').val('');
    }
  }

  function getKeyValuePairs(container, prefix) {
    const pairs = {};
    $(`${container} .${prefix}-row`).each(function() {
      const key = $(this).find(`.${prefix}-key`).val().trim();
      const value = $(this).find(`.${prefix}-value`).val().trim();

      if (key) {
        pairs[key] = value;
      }
    });
    return pairs;
  }

  // Send request
  $('#send-btn').on('click', function() {
    const url = $('#url-input').val().trim();

    if (!url) {
      showError('Please enter a URL');
      return;
    }

    sendRequest();
  });

  // Enter key to send
  $('#url-input').on('keypress', function(e) {
    if (e.which === 13) {
      $('#send-btn').click();
    }
  });

  // OAuth2 helper functions
  async function getOAuth2TokenClientCredentials(tokenUrl, clientId, clientSecret, scope) {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      scope: scope || ''
    });

    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  async function getOAuth2TokenPassword(tokenUrl, clientId, clientSecret, username, password, scope) {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      username: username,
      password: password,
      scope: scope || ''
    });

    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  async function getOAuth2TokenAuthorizationCode(authUrl, tokenUrl, clientId, clientSecret, redirectUri, scope, grantType) {
    return new Promise((resolve, reject) => {
      // Generate PKCE code verifier and challenge for security
      const codeVerifier = generateRandomString(128);
      const state = generateRandomString(32);

      // Build authorization URL
      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri || chrome.identity.getRedirectURL(),
        response_type: grantType === 'implicit' ? 'token' : 'code',
        scope: scope || '',
        state: state
      });

      const fullAuthUrl = `${authUrl}?${authParams.toString()}`;

      // Open OAuth2 authorization window
      chrome.identity.launchWebAuthFlow(
        {
          url: fullAuthUrl,
          interactive: true
        },
        async (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          try {
            const url = new URL(responseUrl);

            if (grantType === 'implicit') {
              // For implicit flow, token is in the fragment
              const params = new URLSearchParams(url.hash.substring(1));
              const accessToken = params.get('access_token');
              const expiresIn = params.get('expires_in');

              if (accessToken) {
                resolve({
                  access_token: accessToken,
                  expires_in: expiresIn ? parseInt(expiresIn) : null,
                  token_type: params.get('token_type') || 'Bearer'
                });
              } else {
                reject(new Error('No access token in response'));
              }
            } else {
              // For authorization code flow, exchange code for token
              const code = url.searchParams.get('code');
              const returnedState = url.searchParams.get('state');

              if (returnedState !== state) {
                reject(new Error('State mismatch - possible CSRF attack'));
                return;
              }

              if (!code) {
                reject(new Error('No authorization code in response'));
                return;
              }

              // Exchange authorization code for access token
              const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: clientId,
                redirect_uri: redirectUri || chrome.identity.getRedirectURL()
              });

              if (clientSecret) {
                body.append('client_secret', clientSecret);
              }

              const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
              });

              if (!response.ok) {
                reject(new Error(`HTTP ${response.status}: ${await response.text()}`));
                return;
              }

              const tokenData = await response.json();
              resolve(tokenData);
            }
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  async function refreshOAuth2Token(tokenUrl, clientId, clientSecret, refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId
    });

    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  function showSuccess(message) {
    // Hide loading and error sections
    $('#loading').addClass('hidden');
    $('#error-section').addClass('hidden');

    // Show temporary success message
    const $successMsg = $('<div class="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mt-4"><div class="flex items-center gap-3 text-emerald-400"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span class="font-semibold text-lg">Success</span></div><p class="text-sm text-emerald-300 mt-2">' + message + '</p></div>');
    $successMsg.insertAfter('#loading');

    setTimeout(() => $successMsg.fadeOut(() => $successMsg.remove()), 3000);
  }

  function buildUrl(baseUrl) {
    // Interpolate the base URL
    const interpolatedBaseUrl = interpolateVariables(baseUrl);

    const rawParams = getKeyValuePairs('#params-container', 'param');
    // Interpolate params
    const params = interpolateObject(rawParams);
    const authType = $('#auth-type').val();

    // Add API key to query if configured
    if (authType === 'api-key' && $('#auth-api-key-location').val() === 'query') {
      const keyName = interpolateVariables($('#auth-api-key-name').val().trim());
      const keyValue = interpolateVariables($('#auth-api-key-value').val().trim());

      if (keyName && keyValue) {
        params[keyName] = keyValue;
      }
    }

    if (Object.keys(params).length === 0) {
      return interpolatedBaseUrl;
    }

    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return interpolatedBaseUrl.includes('?') ? `${interpolatedBaseUrl}&${queryString}` : `${interpolatedBaseUrl}?${queryString}`;
  }

  function buildHeaders() {
    const rawHeaders = getKeyValuePairs('#headers-container', 'header');
    // Interpolate headers
    const headers = interpolateObject(rawHeaders);
    const authType = $('#auth-type').val();

    // Add auth headers (with interpolation)
    if (authType === 'basic') {
      const username = interpolateVariables($('#auth-basic-username').val());
      const password = interpolateVariables($('#auth-basic-password').val());
      headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`);
    } else if (authType === 'bearer') {
      const token = interpolateVariables($('#auth-bearer-token').val().trim());

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (authType === 'oauth2') {
      const accessToken = $('#auth-oauth2-access-token').val().trim();

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } else if (authType === 'api-key' && $('#auth-api-key-location').val() === 'header') {
      const keyName = interpolateVariables($('#auth-api-key-name').val().trim());
      const keyValue = interpolateVariables($('#auth-api-key-value').val().trim());

      if (keyName && keyValue) {
        headers[keyName] = keyValue;
      }
    }

    return headers;
  }

  function buildBody() {
    let body = null;
    let contentType = null;

    switch (selectedBodyType) {
      case 'json':
        const jsonText = $('#body-json-input').val().trim();

        if (jsonText) {
          // Interpolate variables in JSON
          const interpolatedJson = interpolateVariables(jsonText);
          try {
            JSON.parse(interpolatedJson);
            body = interpolatedJson;
            contentType = 'application/json';
          } catch (e) {
            throw new Error('Invalid JSON in request body (after variable interpolation)');
          }
        }
        break;

      case 'xml':
        const xmlText = $('#body-xml-input').val().trim();

        if (xmlText) {
          // Interpolate variables in XML
          body = interpolateVariables(xmlText);
          contentType = 'application/xml';
        }
        break;

      case 'form':
        const rawFormData = getKeyValuePairs('#form-fields-container', 'form-field');
        // Interpolate form data
        const formData = interpolateObject(rawFormData);

        if (Object.keys(formData).length > 0) {
          body = Object.entries(formData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
          contentType = 'application/x-www-form-urlencoded';
        }
        break;

      case 'raw':
        // Interpolate raw body
        body = interpolateVariables($('#body-raw-input').val());
        contentType = interpolateVariables($('#body-raw-content-type').val().trim()) || 'text/plain';
        break;

      case 'schema':
        const schemaValues = getSchemaFormValues();
        // Interpolate string values in schema form
        const interpolatedSchemaValues = {};
        for (const [key, value] of Object.entries(schemaValues)) {
          if (typeof value === 'string') {
            interpolatedSchemaValues[key] = interpolateVariables(value);
          } else if (Array.isArray(value)) {
            interpolatedSchemaValues[key] = value.map(v => typeof v === 'string' ? interpolateVariables(v) : v);
          } else {
            interpolatedSchemaValues[key] = value;
          }
        }
        body = JSON.stringify(interpolatedSchemaValues);
        contentType = 'application/json';
        break;
    }

    return { body, contentType };
  }

  function sendRequest() {
    // Check for missing variables before sending
    const missingVars = getMissingVariables();
    if (missingVars.length > 0) {
      const varList = missingVars.map(v => `\${var:${v}}`).join(', ');
      showError(`Missing variable values: ${varList}. Please set values for these variables before sending the request.`);
      return;
    }

    const method = $('#method-select').val();
    const baseUrl = $('#url-input').val().trim();

    let url, headers, bodyData;

    try {
      url = buildUrl(baseUrl);
      headers = buildHeaders();
      const { body, contentType } = buildBody();
      bodyData = body;

      if (contentType && !headers['Content-Type']) {
        headers['Content-Type'] = contentType;
      }
    } catch (e) {
      showError(e.message);
      return;
    }

    // Capture current request data for history (before interpolation for storage)
    const requestDataForHistory = captureRequestData();

    hideError();
    hideResponse();
    showLoading();

    const startTime = performance.now();

    const ajaxConfig = {
      url: url,
      method: method,
      headers: headers,
      dataType: 'text',
      success: function(data, textStatus, xhr) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        const responseHeaders = xhr.getAllResponseHeaders();
        hideLoading();
        showResponse(xhr.status, data, responseHeaders, duration);

        // Add to history with full response data
        addToHistory(requestDataForHistory, {
          status: xhr.status,
          headers: responseHeaders,
          body: data,
          duration: duration
        });
      },
      error: function(xhr, textStatus, errorThrown) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        const responseHeaders = xhr.getAllResponseHeaders();
        const responseBody = xhr.responseText || errorThrown;
        hideLoading();

        if (xhr.status === 0) {
          showError(`Network error: Could not connect to ${url}. Check if the URL is correct and CORS is enabled.`);
          // Add to history with status 0
          addToHistory(requestDataForHistory, {
            status: 0,
            headers: '',
            body: `Network error: Could not connect to ${url}`,
            duration: duration
          });
        } else {
          showResponse(xhr.status, responseBody, responseHeaders, duration);
          // Add to history
          addToHistory(requestDataForHistory, {
            status: xhr.status,
            headers: responseHeaders,
            body: responseBody,
            duration: duration
          });
        }
      }
    };

    if (bodyData && ['POST', 'PUT', 'PATCH'].includes(method)) {
      ajaxConfig.data = bodyData;
      ajaxConfig.processData = false;
    }

    $.ajax(ajaxConfig);
  }

  // Capture current request data for history storage
  function captureRequestData() {
    const method = $('#method-select').val();
    const url = $('#url-input').val().trim();

    // Capture params
    const params = [];
    $('#params-container .param-row').each(function() {
      const key = $(this).find('.param-key').val().trim();
      const value = $(this).find('.param-value').val().trim();
      if (key) {
        params.push({ key, value });
      }
    });

    // Capture headers
    const headers = [];
    $('#headers-container .header-row').each(function() {
      const key = $(this).find('.header-key').val().trim();
      const value = $(this).find('.header-value').val().trim();
      if (key) {
        headers.push({ key, value });
      }
    });

    // Capture auth
    const authType = $('#auth-type').val();
    const auth = { type: authType };
    if (authType === 'basic') {
      auth.username = $('#auth-basic-username').val();
      auth.password = $('#auth-basic-password').val();
    } else if (authType === 'bearer') {
      auth.token = $('#auth-bearer-token').val();
    } else if (authType === 'api-key') {
      auth.keyName = $('#auth-api-key-name').val();
      auth.keyValue = $('#auth-api-key-value').val();
      auth.location = $('#auth-api-key-location').val();
    }

    // Capture body
    const body = { type: selectedBodyType };
    if (selectedBodyType === 'json') {
      body.content = $('#body-json-input').val();
    } else if (selectedBodyType === 'xml') {
      body.content = $('#body-xml-input').val();
    } else if (selectedBodyType === 'raw') {
      body.content = $('#body-raw-input').val();
      body.contentType = $('#body-raw-content-type').val();
    } else if (selectedBodyType === 'form') {
      body.fields = [];
      $('#form-fields-container .form-field-row').each(function() {
        const key = $(this).find('.form-field-key').val().trim();
        const value = $(this).find('.form-field-value').val().trim();
        if (key) {
          body.fields.push({ key, value });
        }
      });
    } else if (selectedBodyType === 'schema') {
      body.schema = $('#body-schema-input').val();
      body.values = getSchemaFormValues();
    }

    return { method, url, params, headers, auth, body };
  }

  function showLoading() {
    $('#send-btn').prop('disabled', true).addClass('opacity-50');
    $('#loading').removeClass('hidden');
  }

  function hideLoading() {
    $('#send-btn').prop('disabled', false).removeClass('opacity-50');
    $('#loading').addClass('hidden');
  }

  function showResponse(status, body, headers, duration) {
    $('#response-section').removeClass('hidden');

    const $badge = $('#status-badge');
    $badge.text(status);

    if (status >= 200 && status < 300) {
      $badge.removeClass().addClass('px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500/20 text-emerald-400');
    } else if (status >= 400) {
      $badge.removeClass().addClass('px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400');
    } else {
      $badge.removeClass().addClass('px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-500/20 text-amber-400');
    }

    $('#response-time').text(`${duration}ms`);

    let formattedBody = body;
    let isJson = false;
    let parsedJson = null;

    try {
      parsedJson = JSON.parse(body);
      formattedBody = JSON.stringify(parsedJson, null, 2);
      isJson = true;
    } catch (e) {
      // Not JSON, use as-is
    }

    // Handle JSON tree view
    if (isJson) {
      $('#body-view-tabs').removeClass('hidden');

      // Clear previous tree
      $('#response-tree-view').empty();

      // Create new tree
      currentJsonTree = jsonTree.create(parsedJson, $('#response-tree-view')[0]);
      currentJsonTree.expand();

      // Show tree view by default for JSON
      $('#response-tree-view').removeClass('hidden');
      $('#response-body').addClass('hidden');

      // Reset tab states
      $('.body-view-btn').removeClass('active bg-slate-700 text-white').addClass('bg-slate-800 text-slate-400');
      $('.body-view-btn[data-body-view="tree"]').addClass('active bg-slate-700 text-white').removeClass('bg-slate-800 text-slate-400');
    } else {
      $('#body-view-tabs').addClass('hidden');
      $('#response-tree-view').addClass('hidden');
      $('#response-body').removeClass('hidden');
    }

    $('#response-body').text(formattedBody);

    const headersFormatted = headers.split('\r\n').filter(h => h).join('\n');
    $('#response-headers').text(headersFormatted || 'No headers');
  }

  function hideResponse() {
    $('#response-section').addClass('hidden');
  }

  function showError(message) {
    $('#error-section').removeClass('hidden');
    $('#error-message').text(message);
  }

  function hideError() {
    $('#error-section').addClass('hidden');
  }
});
