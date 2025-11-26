$(document).ready(function() {
  let selectedBodyType = 'none';
  let currentJsonTree = null;
  let collections = [];
  let currentRequestId = null;
  let currentCollectionId = null;

  // Load collections from storage
  loadCollections();

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
      const $item = $(`
        <div class="collection-item ${collection.expanded ? 'expanded' : ''}" data-collection-id="${collection.id}">
          <div class="collection-header">
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

  // Toggle collection expand/collapse
  $(document).on('click', '.collection-header', function(e) {
    if ($(e.target).closest('.collection-actions').length) return;

    const $item = $(this).closest('.collection-item');
    const collectionId = $item.data('collection-id');
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      collection.expanded = !collection.expanded;
      $item.toggleClass('expanded');
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
        currentCollectionId = collectionId;
        currentRequestId = requestId;
        loadRequestIntoForm(request);
        $('.request-item').removeClass('active');
        $item.addClass('active');
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
    if (!currentCollectionId || !currentRequestId) return;

    const collection = collections.find(c => c.id === currentCollectionId);
    if (!collection) return;

    const request = collection.requests.find(r => r.id === currentRequestId);
    if (!request) return;

    saveRequestFromForm(request);
    saveCollections();
  });

  function loadRequestIntoForm(request) {
    // Show request name bar
    $('#request-name-bar').removeClass('hidden');
    $('#request-name').val(request.name);

    // Set method and URL
    $('#method-select').val(request.method);
    $('#url-input').val(request.url);

    // Load params
    $('#params-container').empty();
    if (request.params && request.params.length > 0) {
      request.params.forEach(function(param) {
        addKeyValueRow('#params-container', 'param', param.key, param.value);
      });
    } else {
      addKeyValueRow('#params-container', 'param');
    }

    // Load headers
    $('#headers-container').empty();
    if (request.headers && request.headers.length > 0) {
      request.headers.forEach(function(header) {
        addKeyValueRow('#headers-container', 'header', header.key, header.value);
      });
    } else {
      addKeyValueRow('#headers-container', 'header');
    }

    // Load auth
    const auth = request.auth || { type: 'none' };
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
    const body = request.body || { type: 'none', content: '' };
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

  // Body type switching
  $('.body-type-btn').on('click', function() {
    const bodyType = $(this).data('body-type');
    selectedBodyType = bodyType;
    $('.body-type-btn').removeClass('active');
    $(this).addClass('active');
    $('.body-content').addClass('hidden');
    $(`#body-${bodyType}`).removeClass('hidden');
  });

  // Add parameter row
  $('#add-param-btn').on('click', function() {
    addKeyValueRow('#params-container', 'param');
  });

  // Add header row
  $('#add-header-btn').on('click', function() {
    addKeyValueRow('#headers-container', 'header');
  });

  // Add form field row
  $('#add-form-field-btn').on('click', function() {
    addKeyValueRow('#form-fields-container', 'form-field');
  });

  // Remove row handlers (delegated)
  $(document).on('click', '.remove-param-btn', function() {
    removeRow($(this), '#params-container', 'param');
  });

  $(document).on('click', '.remove-header-btn', function() {
    removeRow($(this), '#headers-container', 'header');
  });

  $(document).on('click', '.remove-form-field-btn', function() {
    removeRow($(this), '#form-fields-container', 'form-field');
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

  function buildUrl(baseUrl) {
    const params = getKeyValuePairs('#params-container', 'param');
    const authType = $('#auth-type').val();

    // Add API key to query if configured
    if (authType === 'api-key' && $('#auth-api-key-location').val() === 'query') {
      const keyName = $('#auth-api-key-name').val().trim();
      const keyValue = $('#auth-api-key-value').val().trim();

      if (keyName && keyValue) {
        params[keyName] = keyValue;
      }
    }

    if (Object.keys(params).length === 0) {
      return baseUrl;
    }

    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return baseUrl.includes('?') ? `${baseUrl}&${queryString}` : `${baseUrl}?${queryString}`;
  }

  function buildHeaders() {
    const headers = getKeyValuePairs('#headers-container', 'header');
    const authType = $('#auth-type').val();

    // Add auth headers
    if (authType === 'basic') {
      const username = $('#auth-basic-username').val();
      const password = $('#auth-basic-password').val();
      headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`);
    } else if (authType === 'bearer') {
      const token = $('#auth-bearer-token').val().trim();

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (authType === 'api-key' && $('#auth-api-key-location').val() === 'header') {
      const keyName = $('#auth-api-key-name').val().trim();
      const keyValue = $('#auth-api-key-value').val().trim();

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
          try {
            JSON.parse(jsonText);
            body = jsonText;
            contentType = 'application/json';
          } catch (e) {
            throw new Error('Invalid JSON in request body');
          }
        }
        break;

      case 'xml':
        body = $('#body-xml-input').val().trim();

        if (body) {
          contentType = 'application/xml';
        }
        break;

      case 'form':
        const formData = getKeyValuePairs('#form-fields-container', 'form-field');

        if (Object.keys(formData).length > 0) {
          body = Object.entries(formData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
          contentType = 'application/x-www-form-urlencoded';
        }
        break;

      case 'raw':
        body = $('#body-raw-input').val();
        contentType = $('#body-raw-content-type').val().trim() || 'text/plain';
        break;

      case 'schema':
        const schemaValues = getSchemaFormValues();
        body = JSON.stringify(schemaValues);
        contentType = 'application/json';
        break;
    }

    return { body, contentType };
  }

  function sendRequest() {
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
        hideLoading();
        showResponse(xhr.status, data, xhr.getAllResponseHeaders(), duration);
      },
      error: function(xhr, textStatus, errorThrown) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        hideLoading();

        if (xhr.status === 0) {
          showError(`Network error: Could not connect to ${url}. Check if the URL is correct and CORS is enabled.`);
        } else {
          showResponse(xhr.status, xhr.responseText || errorThrown, xhr.getAllResponseHeaders(), duration);
        }
      }
    };

    if (bodyData && ['POST', 'PUT', 'PATCH'].includes(method)) {
      ajaxConfig.data = bodyData;
      ajaxConfig.processData = false;
    }

    $.ajax(ajaxConfig);
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
