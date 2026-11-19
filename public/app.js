/**
 * EdVyro Careers - Responsive Internship Board Frontend Application
 * Pure Vanilla JavaScript (Zero Frameworks, No Libraries).
 * Beginner-friendly, well-commented, and WCAG 2.1 AA Compliant.
 *
 * CRITICAL SECURITY RULE:
 * Never use innerHTML with dynamic user data. Use textContent,
 * setAttribute, and document.createElement to prevent XSS vulnerabilities.
 */

(() => {
  'use strict';

  // =========================================================================
  // 1. Application State
  // =========================================================================
  const state = {
    search: '',
    domain: 'all',
    mode: 'all',
    page: 1,
    limit: 12,
    internships: [],
    currentInternship: null,
    triggerElement: null, // Stores previously focused card element
    isLoading: false
  };

  // =========================================================================
  // 2. DOM Elements Cache
  // =========================================================================
  const DOM = {
    // Search & Filter controls
    filtersForm: document.getElementById('filters-form'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    domainSelect: document.getElementById('domain-select'),
    modeSelect: document.getElementById('mode-select'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),

    // Result status & grid
    resultsCount: document.getElementById('results-count'),
    internshipsGrid: document.getElementById('internships-grid'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    resetEmptyBtn: document.getElementById('reset-empty-btn'),

    // Details & Application Dialog
    dialog: document.getElementById('details-dialog'),
    dialogCloseBtn: document.getElementById('dialog-close-btn'),
    dialogCancelBtn: document.getElementById('dialog-cancel-btn'),
    dialogId: document.getElementById('dialog-id'),
    dialogDomain: document.getElementById('dialog-domain'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogMode: document.getElementById('dialog-mode'),
    dialogLocation: document.getElementById('dialog-location'),
    dialogOpenings: document.getElementById('dialog-openings'),
    dialogStipend: document.getElementById('dialog-stipend'),
    dialogDuration: document.getElementById('dialog-duration'),
    dialogDescription: document.getElementById('dialog-description'),
    dialogSkills: document.getElementById('dialog-skills'),

    // Application Form
    applicationForm: document.getElementById('application-form'),
    applyInternshipId: document.getElementById('apply-internship-id'),
    applyName: document.getElementById('apply-name'),
    applyEmail: document.getElementById('apply-email'),
    applyPortfolio: document.getElementById('apply-portfolio'),
    applyWhy: document.getElementById('apply-why'),
    nameError: document.getElementById('name-error'),
    emailError: document.getElementById('email-error'),
    portfolioError: document.getElementById('portfolio-error'),
    whyError: document.getElementById('why-error'),
    formAlert: document.getElementById('form-alert'),
    submitBtn: document.getElementById('submit-btn'),
    submitBtnText: document.getElementById('submit-btn-text'),
    submitSpinner: document.getElementById('submit-spinner'),

    // Toast
    toast: document.getElementById('toast')
  };

  // =========================================================================
  // 3. Utility Helpers
  // =========================================================================

  /**
   * Debounce helper function
   * Delays function execution until after delay milliseconds of inactivity.
   */
  function debounce(callback, delay = 300) {
    let timerId;
    return (...args) => {
      clearTimeout(timerId);
      timerId = setTimeout(() => callback.apply(null, args), delay);
    };
  }

  /**
   * Converts domain name to CSS-friendly class name
   */
  function getDomainClass(domain) {
    return 'domain-' + String(domain).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /**
   * Displays a temporary notification toast message
   */
  function showToast(message, duration = 3500) {
    if (!DOM.toast) return;
    DOM.toast.textContent = message;
    DOM.toast.classList.remove('hidden');

    setTimeout(() => {
      DOM.toast.classList.add('hidden');
    }, duration);
  }

  // =========================================================================
  // 4. API Client Layer
  // =========================================================================

  /**
   * Fetch internships list from backend API with active search & filters
   */
  async function fetchInternships() {
    setUIState('loading');
    state.isLoading = true;

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (state.search) params.append('search', state.search);
    if (state.domain && state.domain !== 'all') params.append('domain', state.domain);
    if (state.mode && state.mode !== 'all') params.append('mode', state.mode);
    params.append('page', state.page);
    params.append('limit', state.limit);

    try {
      const response = await fetch(`/api/internships?${params.toString()}`);
      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || `Server returned error (${response.status})`);
      }

      state.internships = result.data || [];
      renderInternships(state.internships, result.pagination);
    } catch (err) {
      console.error('[API ERROR]', err);
      showErrorState(err.message || 'Unable to connect to the EdVyro Careers server.');
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Fetch single internship details by ID
   */
  async function fetchInternshipById(id) {
    try {
      const response = await fetch(`/api/internships/${encodeURIComponent(id)}`);
      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Internship not found.');
      }
      return result.data;
    } catch (err) {
      console.error('[API ERROR]', err);
      throw err;
    }
  }

  /**
   * Submit an application to POST /api/applications
   */
  async function submitApplicationApi(payload) {
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body: result
    };
  }

  // =========================================================================
  // 5. UI State Management (Loading, Empty, Error, Content)
  // =========================================================================

  function setUIState(mode) {
    DOM.loadingState.classList.add('hidden');
    DOM.emptyState.classList.add('hidden');
    DOM.errorState.classList.add('hidden');
    DOM.internshipsGrid.classList.add('hidden');

    if (mode === 'loading') {
      DOM.loadingState.classList.remove('hidden');
      DOM.resultsCount.textContent = 'Searching opportunities...';
    } else if (mode === 'empty') {
      DOM.emptyState.classList.remove('hidden');
      DOM.resultsCount.textContent = 'Showing 0 opportunities';
    } else if (mode === 'error') {
      DOM.errorState.classList.remove('hidden');
      DOM.resultsCount.textContent = 'Error loading opportunities';
    } else if (mode === 'content') {
      DOM.internshipsGrid.classList.remove('hidden');
    }
  }

  function showErrorState(message) {
    setUIState('error');
    DOM.errorMessage.textContent = message;
  }

  // =========================================================================
  // 6. Safe DOM Rendering (NO innerHTML with user data!)
  // =========================================================================

  /**
   * Renders internship cards into the grid safely using textContent
   */
  function renderInternships(items, pagination) {
    // Clear existing cards
    DOM.internshipsGrid.replaceChildren();

    if (!items || items.length === 0) {
      setUIState('empty');
      return;
    }

    setUIState('content');

    // Update announcement count for screen readers
    const total = pagination ? pagination.total : items.length;
    DOM.resultsCount.textContent = `Showing ${items.length} of ${total} internship opportunit${total === 1 ? 'y' : 'ies'}`;

    // Create cards safely
    items.forEach(item => {
      const card = createInternshipCard(item);
      DOM.internshipsGrid.appendChild(card);
    });
  }

  /**
   * Constructs an accessible internship <article> card with keyboard support
   */
  function createInternshipCard(item) {
    const card = document.createElement('article');
    card.className = 'internship-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-haspopup', 'dialog');
    card.setAttribute('aria-label', `${item.title}, ${item.domain}, ${item.mode} in ${item.location}. Press Enter or Space for details.`);
    card.dataset.id = item.id;

    // Top Header Row
    const headerRow = document.createElement('div');
    headerRow.className = 'card-header-row';

    const idBadge = document.createElement('span');
    idBadge.className = 'badge-id';
    idBadge.textContent = item.id;

    const domainBadge = document.createElement('span');
    domainBadge.className = `badge-domain ${getDomainClass(item.domain)}`;
    domainBadge.textContent = item.domain;

    headerRow.appendChild(idBadge);
    headerRow.appendChild(domainBadge);

    // Title
    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = item.title;

    // Meta Row (Mode & Location)
    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta-row';

    const modeTag = document.createElement('span');
    modeTag.className = `mode-tag ${item.mode}`;
    modeTag.textContent = item.mode;

    const locationSpan = document.createElement('span');
    locationSpan.className = 'location-tag';
    locationSpan.textContent = `📍 ${item.location}`;

    metaRow.appendChild(modeTag);
    metaRow.appendChild(locationSpan);

    // Skills Tags List
    const skillsList = document.createElement('div');
    skillsList.className = 'skills-tags';
    skillsList.setAttribute('aria-label', 'Required skills');

    if (Array.isArray(item.skills)) {
      item.skills.forEach(skill => {
        const skillPill = document.createElement('span');
        skillPill.className = 'skill-pill';
        skillPill.textContent = skill;
        skillsList.appendChild(skillPill);
      });
    }

    // Card Footer
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const openings = document.createElement('span');
    openings.className = 'openings-badge';
    openings.textContent = `${item.openings} Opening${item.openings === 1 ? '' : 's'}`;

    const cta = document.createElement('span');
    cta.className = 'card-cta';
    cta.textContent = 'View Details →';

    footer.appendChild(openings);
    footer.appendChild(cta);

    // Assemble Card
    card.appendChild(headerRow);
    card.appendChild(title);
    card.appendChild(metaRow);
    card.appendChild(skillsList);
    card.appendChild(footer);

    // Event Listeners: Mouse click & Keyboard (Enter / Space)
    card.addEventListener('click', () => {
      openDetailsDialog(item.id, card);
    });

    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); // Prevent page scroll on Space
        openDetailsDialog(item.id, card);
      }
    });

    return card;
  }

  // =========================================================================
  // 7. Details & Application Dialog Controller (Focus Trap & Keyboard)
  // =========================================================================

  /**
   * Opens the <dialog> modal, populates data, and establishes focus trap
   */
  async function openDetailsDialog(id, triggeringElement) {
    state.triggerElement = triggeringElement;

    try {
      const item = await fetchInternshipById(id);
      state.currentInternship = item;

      // Populate text safely
      DOM.dialogId.textContent = item.id;
      DOM.dialogDomain.textContent = item.domain;
      DOM.dialogDomain.className = `badge-domain ${getDomainClass(item.domain)}`;
      DOM.dialogTitle.textContent = item.title;
      DOM.dialogMode.textContent = item.mode;
      DOM.dialogLocation.textContent = item.location;
      DOM.dialogOpenings.textContent = `${item.openings} Position${item.openings === 1 ? '' : 's'}`;
      DOM.dialogStipend.textContent = item.stipend || 'Competitive';
      DOM.dialogDuration.textContent = item.duration || 'Flexible';
      DOM.dialogDescription.textContent = item.description || 'Join our innovative engineering team to solve challenging real-world problems.';

      // Populate skills tags safely
      DOM.dialogSkills.replaceChildren();
      if (Array.isArray(item.skills)) {
        item.skills.forEach(skill => {
          const pill = document.createElement('span');
          pill.className = 'skill-pill';
          pill.textContent = skill;
          DOM.dialogSkills.appendChild(pill);
        });
      }

      // Reset application form
      resetApplicationForm();
      DOM.applyInternshipId.value = item.id;

      // Open native <dialog>
      if (typeof DOM.dialog.showModal === 'function') {
        DOM.dialog.showModal();
      } else {
        DOM.dialog.setAttribute('open', '');
      }

      document.body.style.overflow = 'hidden';

      // Move focus inside dialog (to close button or first actionable element)
      setTimeout(() => {
        DOM.dialogCloseBtn.focus();
      }, 50);

    } catch (err) {
      showToast(err.message || 'Failed to open internship details.');
    }
  }

  /**
   * Closes the dialog and restores focus back to the triggering card
   */
  function closeDetailsDialog() {
    if (typeof DOM.dialog.close === 'function') {
      DOM.dialog.close();
    } else {
      DOM.dialog.removeAttribute('open');
    }

    document.body.style.overflow = '';

    // Restore focus back to the triggering card for screen reader / keyboard flow
    if (state.triggerElement && typeof state.triggerElement.focus === 'function') {
      state.triggerElement.focus();
    }
  }

  /**
   * Strict Focus Trap Implementation
   * Traps Tab and Shift+Tab cycles strictly within the modal dialog.
   */
  function handleFocusTrap(e) {
    if (!DOM.dialog.open || e.key !== 'Tab') return;

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(DOM.dialog.querySelectorAll(focusableSelectors))
      .filter(el => !el.disabled && el.offsetParent !== null);

    if (focusable.length === 0) return;

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift + Tab -> moving backward
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab -> moving forward
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  // =========================================================================
  // 8. Application Form Validation & Submission
  // =========================================================================

  function resetApplicationForm() {
    DOM.applicationForm.reset();
    clearFormErrors();
    DOM.formAlert.classList.add('hidden');
    DOM.formAlert.className = 'form-alert hidden';
    DOM.formAlert.textContent = '';
    DOM.submitBtn.disabled = false;
    DOM.submitBtnText.textContent = 'Submit Application';
    DOM.submitSpinner.classList.add('hidden');
  }

  function clearFormErrors() {
    DOM.nameError.textContent = '';
    DOM.emailError.textContent = '';
    DOM.portfolioError.textContent = '';
    DOM.whyError.textContent = '';

    DOM.applyName.classList.remove('invalid');
    DOM.applyEmail.classList.remove('invalid');
    DOM.applyPortfolio.classList.remove('invalid');
    DOM.applyWhy.classList.remove('invalid');

    DOM.applyName.removeAttribute('aria-invalid');
    DOM.applyEmail.removeAttribute('aria-invalid');
    DOM.applyPortfolio.removeAttribute('aria-invalid');
    DOM.applyWhy.removeAttribute('aria-invalid');
  }

  /**
   * Validates individual field with inline accessible error message
   */
  function validateField(field) {
    let isValid = true;
    let message = '';
    const val = field.value.trim();

    if (field === DOM.applyName) {
      if (!val || val.length < 2) {
        isValid = false;
        message = 'Please enter your full name (minimum 2 characters).';
      }
      DOM.nameError.textContent = message;
    } else if (field === DOM.applyEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!val || !emailRegex.test(val)) {
        isValid = false;
        message = 'Please enter a valid email address (e.g., student@university.edu).';
      }
      DOM.emailError.textContent = message;
    } else if (field === DOM.applyPortfolio) {
      if (val) {
        try {
          const parsed = new URL(val);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            isValid = false;
            message = 'URL must start with http:// or https:// (unsafe schemes are blocked).';
          }
        } catch (_) {
          isValid = false;
          message = 'Please enter a valid URL (e.g. https://github.com/yourname).';
        }
      }
      DOM.portfolioError.textContent = message;
    } else if (field === DOM.applyWhy) {
      if (!val || val.length < 10) {
        isValid = false;
        message = 'Please tell us why you are a good fit (minimum 10 characters).';
      }
      DOM.whyError.textContent = message;
    }

    if (!isValid) {
      field.classList.add('invalid');
      field.setAttribute('aria-invalid', 'true');
    } else {
      field.classList.remove('invalid');
      field.removeAttribute('aria-invalid');
    }

    return isValid;
  }

  /**
   * Handles Form Submit
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    clearFormErrors();

    // Validate all fields
    const validName = validateField(DOM.applyName);
    const validEmail = validateField(DOM.applyEmail);
    const validPortfolio = validateField(DOM.applyPortfolio);
    const validWhy = validateField(DOM.applyWhy);

    if (!validName || !validEmail || !validPortfolio || !validWhy) {
      // Focus first invalid input
      const firstInvalid = DOM.applicationForm.querySelector('.form-control.invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Prepare payload
    const payload = {
      internshipId: DOM.applyInternshipId.value,
      fullName: DOM.applyName.value.trim(),
      email: DOM.applyEmail.value.trim(),
      portfolioUrl: DOM.applyPortfolio.value.trim(),
      whyYou: DOM.applyWhy.value.trim()
    };

    // UI Loading state
    DOM.submitBtn.disabled = true;
    DOM.submitBtnText.textContent = 'Submitting...';
    DOM.submitSpinner.classList.remove('hidden');
    DOM.formAlert.classList.add('hidden');

    try {
      const response = await submitApplicationApi(payload);

      if (response.ok && response.status === 201) {
        // Success
        DOM.formAlert.className = 'form-alert alert-success';
        DOM.formAlert.textContent = response.body.message || 'Application submitted successfully!';
        DOM.formAlert.classList.remove('hidden');

        DOM.submitBtnText.textContent = 'Application Sent!';
        showToast('Application submitted successfully!');

        setTimeout(() => {
          closeDetailsDialog();
        }, 1800);
      } else {
        // Validation Error (400) or Duplicate Application (409)
        DOM.formAlert.className = 'form-alert alert-error';
        DOM.formAlert.textContent = response.body.message || 'Failed to submit application.';
        DOM.formAlert.classList.remove('hidden');

        DOM.submitBtn.disabled = false;
        DOM.submitBtnText.textContent = 'Submit Application';
      }
    } catch (err) {
      DOM.formAlert.className = 'form-alert alert-error';
      DOM.formAlert.textContent = 'Network error while contacting the server. Please try again.';
      DOM.formAlert.classList.remove('hidden');

      DOM.submitBtn.disabled = false;
      DOM.submitBtnText.textContent = 'Submit Application';
    } finally {
      DOM.submitSpinner.classList.add('hidden');
    }
  }

  // =========================================================================
  // 9. Event Listeners Initialization
  // =========================================================================
  function setupEventListeners() {
    // 1. Debounced Live Search
    const debouncedSearch = debounce(searchTerm => {
      state.search = searchTerm.trim();
      state.page = 1;
      fetchInternships();
    }, 300);

    DOM.searchInput.addEventListener('input', e => {
      const val = e.target.value;
      if (val.length > 0) {
        DOM.clearSearchBtn.classList.remove('hidden');
      } else {
        DOM.clearSearchBtn.classList.add('hidden');
      }
      debouncedSearch(val);
    });

    DOM.clearSearchBtn.addEventListener('click', () => {
      DOM.searchInput.value = '';
      DOM.clearSearchBtn.classList.add('hidden');
      state.search = '';
      state.page = 1;
      DOM.searchInput.focus();
      fetchInternships();
    });

    // 2. Domain Filter
    DOM.domainSelect.addEventListener('change', e => {
      state.domain = e.target.value;
      state.page = 1;
      fetchInternships();
    });

    // 3. Work Mode Filter
    DOM.modeSelect.addEventListener('change', e => {
      state.mode = e.target.value;
      state.page = 1;
      fetchInternships();
    });

    // 4. Reset Filters
    const resetAllFilters = () => {
      DOM.filtersForm.reset();
      DOM.clearSearchBtn.classList.add('hidden');
      state.search = '';
      state.domain = 'all';
      state.mode = 'all';
      state.page = 1;
      fetchInternships();
      showToast('Filters cleared.');
    };

    DOM.resetFiltersBtn.addEventListener('click', resetAllFilters);
    DOM.resetEmptyBtn.addEventListener('click', resetAllFilters);
    DOM.retryBtn.addEventListener('click', () => fetchInternships());

    // 5. Modal Dialog Close Events
    DOM.dialogCloseBtn.addEventListener('click', closeDetailsDialog);
    DOM.dialogCancelBtn.addEventListener('click', closeDetailsDialog);

    // Close when clicking dialog backdrop
    DOM.dialog.addEventListener('click', e => {
      if (e.target === DOM.dialog) {
        closeDetailsDialog();
      }
    });

    // 6. Keyboard Accessibility (Escape to close, Focus trap inside dialog)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && DOM.dialog.open) {
        closeDetailsDialog();
      } else if (e.key === 'Tab' && DOM.dialog.open) {
        handleFocusTrap(e);
      }
    });

    // 7. Live Input Validation on blur
    [DOM.applyName, DOM.applyEmail, DOM.applyPortfolio, DOM.applyWhy].forEach(input => {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => {
        if (input.classList.contains('invalid')) {
          validateField(input);
        }
      });
    });

    // 8. Application Form Submission
    DOM.applicationForm.addEventListener('submit', handleFormSubmit);
  }

  // =========================================================================
  // 10. Application Entry Point
  // =========================================================================
  function init() {
    setupEventListeners();
    fetchInternships();
  }

  // Ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
