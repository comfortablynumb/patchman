$(document).ready(function() {
  let selectedBodyType = 'none';
  let currentJsonTree = null;

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

  function addKeyValueRow(container, prefix) {
    const row = `
      <div class="${prefix}-row flex gap-2 items-center">
        <input type="text" placeholder="Key" class="${prefix}-key flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
        <input type="text" placeholder="Value" class="${prefix}-value flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
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
