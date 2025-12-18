/**
 * ============================================
 * QURAN PWA - Main Application Logic
 * ============================================
 * 
 * This app uses the Al Quran Cloud API:
 * https://alquran.cloud/api
 * 
 * Modules:
 * - Navigation & Tab switching
 * - Settings (languages, editions)
 * - Reading (surah list, surah view)
 * - Listening (audio player)
 * - PWA (service worker, install prompt)
 * ============================================
 */

// API Base URL
const API_BASE = 'https://api.alquran.cloud/v1';

// Default edition for Arabic text
const DEFAULT_EDITION = 'quran-uthmani';

// State
const state = {
    surahs: [],
    currentSurah: null,
    languages: [],
    editions: [],
    audioEditions: [],
    selectedEdition: localStorage.getItem('selectedEdition') || DEFAULT_EDITION,
    selectedAudioEdition: localStorage.getItem('selectedAudioEdition') || 'ar.alafasy',
    selectedLanguage: localStorage.getItem('selectedLanguage') || 'ar',
    isOffline: !navigator.onLine
};

// DOM Elements Cache
const elements = {
    // Navigation
    navLinks: null,
    tabContents: null,

    // Loading & Error
    loadingOverlay: null,
    errorToast: null,
    errorMessage: null,
    toastClose: null,
    offlineIndicator: null,

    // Install Banner
    installBanner: null,
    installBtn: null,
    installDismiss: null,

    // Read Tab
    surahList: null,
    surahSearch: null,
    surahListView: null,
    surahView: null,
    backToList: null,
    surahTitle: null,
    surahSubtitle: null,
    ayahsContainer: null,

    // Listen Tab
    audioSurahSelect: null,
    reciterSelect: null,
    audioPlayerContainer: null,
    audioPlayer: null,
    nowPlayingSurah: null,
    nowPlayingReciter: null,

    // Settings Tab
    languageSelect: null,
    editionSelect: null,
    formatSelect: null,
    currentEdition: null,
    currentLanguage: null
};

// ============================================
// ANALYTICS TRACKING
// ============================================

// Umami analytics tracking helper
function trackEvent(eventName, eventData = {}) {
    try {
        if (typeof window.umami !== 'undefined') {
            window.umami.track(eventName, eventData);
        }
    } catch (error) {
        // Silently fail if Umami is not available
        console.debug('Analytics tracking failed:', error);
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    cacheElements();
    initNavigation();
    initEventListeners();
    initPWA();
    initAudioControls();
    initQuickLanguageSelector();
    checkOnlineStatus();

    // Load initial data
    await loadInitialData();
}

function cacheElements() {
    elements.navLinks = document.querySelectorAll('.nav-link');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.loadingOverlay = document.getElementById('loading-overlay');
    elements.errorToast = document.getElementById('error-toast');
    elements.errorMessage = document.getElementById('error-message');
    elements.toastClose = document.getElementById('toast-close');
    elements.offlineIndicator = document.getElementById('offline-indicator');
    elements.installBanner = document.getElementById('install-banner');
    elements.installBtn = document.getElementById('install-btn');
    elements.installDismiss = document.getElementById('install-dismiss');
    elements.surahList = document.getElementById('surah-list');
    elements.surahSearch = document.getElementById('surah-search');
    elements.surahListView = document.getElementById('surah-list-view');
    elements.surahView = document.getElementById('surah-view');
    elements.backToList = document.getElementById('back-to-list');
    elements.surahTitle = document.getElementById('surah-title');
    elements.surahSubtitle = document.getElementById('surah-subtitle');
    elements.ayahsContainer = document.getElementById('ayahs-container');
    elements.audioSurahSelect = document.getElementById('audio-surah-select');
    elements.reciterSelect = document.getElementById('reciter-select');
    elements.audioPlayerContainer = document.getElementById('audio-player-container');
    elements.audioPlayer = document.getElementById('audio-player');
    elements.nowPlayingSurah = document.getElementById('now-playing-surah');
    elements.nowPlayingReciter = document.getElementById('now-playing-reciter');
    elements.languageSelect = document.getElementById('language-select');
    elements.editionSelect = document.getElementById('edition-select');
    elements.formatSelect = document.getElementById('format-select');
    elements.currentEdition = document.getElementById('current-edition');
    elements.currentLanguage = document.getElementById('current-language');
}

function initNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Track navigation with specific event name for each tab
    trackEvent(`tab-${tabId}`);

    // Prevent position tracking during tab switch scroll
    if (typeof isScrollingToSavedPosition !== 'undefined') {
        isScrollingToSavedPosition = true;
        setTimeout(() => { isScrollingToSavedPosition = false; }, 500);
    }

    // Update nav links
    elements.navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabId);
    });

    // Update tab contents
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabId}-tab`);
    });

    // Load data for specific tabs if needed
    if (tabId === 'read' && state.surahs.length === 0) {
        fetchSurahs();
    }

    // Reset scroll position
    window.scrollTo(0, 0);
}

function initEventListeners() {
    // Quick action buttons on Home
    document.querySelector('[data-action="start-reading"]')?.addEventListener('click', () => {
        switchTab('read');
    });

    document.querySelector('[data-action="start-listening"]')?.addEventListener('click', () => {
        switchTab('listen');
    });

    // Back to surah list
    elements.backToList?.addEventListener('click', showSurahList);

    // Surah search
    elements.surahSearch?.addEventListener('input', filterSurahs);

    // Toast close
    elements.toastClose?.addEventListener('click', hideError);

    // Settings changes
    elements.languageSelect?.addEventListener('change', onLanguageChange);
    elements.editionSelect?.addEventListener('change', onEditionChange);
    elements.formatSelect?.addEventListener('change', onFormatChange);

    // Audio controls
    elements.audioSurahSelect?.addEventListener('change', onAudioSurahChange);
    elements.reciterSelect?.addEventListener('change', onReciterChange);

    // Back from Listen tab to Home
    document.getElementById('back-to-home-from-listen')?.addEventListener('click', () => {
        switchTab('home');
    });

    // Install banner
    elements.installDismiss?.addEventListener('click', () => {
        elements.installBanner?.classList.add('hidden');
    });
}

async function loadInitialData() {
    showLoading();

    try {
        await Promise.all([
            fetchSurahs(),
            fetchLanguages(),
            fetchAudioEditions()
        ]);

        updateSettingsDisplay();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Failed to load data. Please check your connection.');
    } finally {
        hideLoading();
    }
}

// ============================================
// ONLINE/OFFLINE STATUS
// ============================================

function checkOnlineStatus() {
    window.addEventListener('online', () => {
        state.isOffline = false;
        elements.offlineIndicator?.classList.add('hidden');
    });

    window.addEventListener('offline', () => {
        state.isOffline = true;
        elements.offlineIndicator?.classList.remove('hidden');
    });

    if (!navigator.onLine) {
        elements.offlineIndicator?.classList.remove('hidden');
    }
}

// ============================================
// LOADING & ERROR HANDLING
// ============================================

function showLoading() {
    elements.loadingOverlay?.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay?.classList.add('hidden');
}

function showError(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
    }
    elements.errorToast?.classList.remove('hidden');

    // Auto hide after 5 seconds
    setTimeout(hideError, 5000);
}

function hideError() {
    elements.errorToast?.classList.add('hidden');
}

function showSuccess(message) {
    const successToast = document.getElementById('success-toast');
    const successMessage = document.getElementById('success-message');
    if (successMessage) {
        successMessage.textContent = message;
    }
    successToast?.classList.remove('hidden');

    // Auto hide after 2 seconds
    setTimeout(hideSuccess, 2000);
}

function hideSuccess() {
    const successToast = document.getElementById('success-toast');
    successToast?.classList.add('hidden');
}

// ============================================
// API HELPERS
// ============================================

async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.data || 'API Error');
        }
        return data.data;
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}

// ============================================
// SURAHS (READ TAB)
// ============================================

async function fetchSurahs() {
    try {
        const data = await fetchAPI('/surah');
        state.surahs = data;
        renderSurahList();
        populateAudioSurahSelect();
    } catch (error) {
        console.error('Error fetching surahs:', error);
        showError('Failed to load Surah list.');
    }
}

function renderSurahList() {
    if (!elements.surahList) return;

    const searchTerm = elements.surahSearch?.value?.toLowerCase() || '';
    const filteredSurahs = state.surahs.filter(surah => {
        const matchesName = surah.englishName.toLowerCase().includes(searchTerm);
        const matchesNumber = surah.number.toString().includes(searchTerm);
        return matchesName || matchesNumber;
    });

    elements.surahList.innerHTML = filteredSurahs.map(surah => `
        <div class="surah-card" data-surah="${surah.number}">
            <div class="surah-number">${surah.number}</div>
            <div class="surah-details">
                <div class="surah-name-english">${surah.englishName}</div>
                <div class="surah-meta">${surah.englishNameTranslation} • ${surah.numberOfAyahs} Ayahs</div>
            </div>
            <div class="surah-arabic-name">${surah.name}</div>
        </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.surah-card').forEach(card => {
        card.addEventListener('click', () => {
            const surahNumber = parseInt(card.dataset.surah);
            loadSurah(surahNumber);
        });
    });
}

function filterSurahs() {
    renderSurahList();
}

async function loadSurah(surahNumber) {
    showLoading();

    try {
        // Fetch Arabic text
        const arabicData = await fetchAPI(`/surah/${surahNumber}/quran-uthmani`);

        // Check if we have a translation edition selected
        let translationData = null;
        if (state.selectedEdition && state.selectedEdition !== 'quran-uthmani' && state.selectedEdition !== DEFAULT_EDITION) {
            try {
                translationData = await fetchAPI(`/surah/${surahNumber}/${state.selectedEdition}`);
            } catch (e) {
                console.warn('Translation not available:', e);
            }
        }

        state.currentSurah = {
            arabic: arabicData,
            translation: translationData
        };

        // Track surah reading
        trackEvent('surah-opened', {
            surahNumber: surahNumber,
            surahName: arabicData.englishName,
            translation: state.selectedEdition !== DEFAULT_EDITION
        });

        renderSurah();
        showSurahView();
    } catch (error) {
        console.error('Error loading surah:', error);
        showError('Failed to load Surah. Please try again.');
    } finally {
        hideLoading();
    }
}

function renderSurah() {
    if (!state.currentSurah) return;

    const { arabic, translation } = state.currentSurah;

    if (elements.surahTitle) {
        elements.surahTitle.textContent = arabic.name;
    }
    if (elements.surahSubtitle) {
        elements.surahSubtitle.textContent = `${arabic.englishName} - ${arabic.englishNameTranslation} • ${arabic.numberOfAyahs} Ayahs`;
    }

    if (elements.ayahsContainer) {
        // Add Play Surah button at the top
        const playSurahBtn = `
            <div class="play-surah-container">
                <button class="play-surah-btn" data-surah="${arabic.number}">
                    <span class="material-symbols-outlined">play_circle</span>
                    <span>Play Entire Surah</span>
                </button>
            </div>
        `;

        // Render ayahs with individual play buttons and bookmark buttons
        const ayahsHtml = arabic.ayahs.map((ayah, index) => {
            const translationText = translation?.ayahs?.[index]?.text || '';
            const bookmarkId = `quran-${arabic.number}-${ayah.numberInSurah}`;
            const ayahIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('quran', bookmarkId);
            return `
                <div class="ayah-card" data-ayah-number="${ayah.numberInSurah}">
                    <div class="ayah-header">
                        <span class="ayah-number">${ayah.numberInSurah}</span>
                        <div class="ayah-actions">
                            <button class="ayah-play-btn" data-surah="${arabic.number}" data-ayah="${ayah.numberInSurah}" title="Play this ayah">
                                <span class="material-symbols-outlined">play_arrow</span>
                            </button>
                            <button class="ayah-bookmark-btn ${ayahIsBookmarked ? 'bookmarked' : ''}" 
                                data-surah-number="${arabic.number}"
                                data-surah-name="${arabic.name}"
                                data-surah-english="${arabic.englishName}"
                                data-ayah-number="${ayah.numberInSurah}"
                                data-arabic="${encodeURIComponent(ayah.text)}"
                                data-translation="${encodeURIComponent(translationText)}"
                                data-juz="${ayah.juz || ''}"
                                data-revelation="${arabic.revelationType || 'Meccan'}"
                                title="Bookmark this ayah">
                                <span class="material-symbols-outlined">${ayahIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                            </button>
                            <button class="ayah-share-btn" 
                                data-surah-name="${arabic.englishName}"
                                data-ayah-number="${ayah.numberInSurah}"
                                data-arabic="${encodeURIComponent(ayah.text)}"
                                data-translation="${encodeURIComponent(translationText)}"
                                title="Share this ayah">
                                <span class="material-symbols-outlined">share</span>
                            </button>
                        </div>
                    </div>
                    <p class="ayah-arabic">${ayah.text}</p>
                    ${translationText ? `<p class="ayah-translation">${translationText}</p>` : ''}
                </div>
            `;
        }).join('');


        elements.ayahsContainer.innerHTML = playSurahBtn + ayahsHtml;

        // Add inline audio player (hidden initially)
        const inlinePlayer = document.getElementById('read-inline-player');
        if (!inlinePlayer) {
            const playerHtml = `
                <div id="read-inline-player" class="read-inline-player hidden">
                    <div class="inline-player-info">
                        <span class="material-symbols-outlined playing-icon">graphic_eq</span>
                        <span id="inline-player-text">Playing...</span>
                    </div>
                    <div class="inline-player-controls">
                        <button id="inline-prev-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">skip_previous</span>
                        </button>
                        <button id="inline-play-pause-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">pause</span>
                        </button>
                        <button id="inline-next-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">skip_next</span>
                        </button>
                        <button id="inline-close-btn" class="inline-control-btn close">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <audio id="read-audio-player"></audio>
                </div>
            `;
            elements.ayahsContainer.insertAdjacentHTML('afterbegin', playerHtml);
        }

        // Attach event listeners for play buttons
        attachReadAudioListeners();
    }

    // Scroll to top instantly
    window.scrollTo(0, 0);
}

function showSurahView() {
    elements.surahListView?.classList.add('hidden');
    elements.surahView?.classList.remove('hidden');
}

function showSurahList() {
    // Prevent position tracking during navigation scroll
    if (typeof isScrollingToSavedPosition !== 'undefined') {
        isScrollingToSavedPosition = true;
        setTimeout(() => { isScrollingToSavedPosition = false; }, 500);
    }

    elements.surahView?.classList.add('hidden');
    elements.surahListView?.classList.remove('hidden');
    state.currentSurah = null;
    window.scrollTo(0, 0);
}

// ============================================
// SETTINGS TAB
// ============================================

async function fetchLanguages() {
    try {
        const data = await fetchAPI('/edition/language');
        state.languages = data;
        renderLanguageSelect();
    } catch (error) {
        console.error('Error fetching languages:', error);
    }
}

function renderLanguageSelect() {
    if (!elements.languageSelect) return;

    // Common language names mapping
    const languageNames = {
        'ar': 'Arabic',
        'en': 'English',
        'ur': 'Urdu',
        'fr': 'French',
        'de': 'German',
        'es': 'Spanish',
        'tr': 'Turkish',
        'id': 'Indonesian',
        'bn': 'Bengali',
        'fa': 'Persian',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'hi': 'Hindi',
        'ml': 'Malayalam',
        'ta': 'Tamil'
    };

    elements.languageSelect.innerHTML = state.languages.map(lang => {
        const displayName = languageNames[lang] || lang.toUpperCase();
        return `<option value="${lang}" ${lang === state.selectedLanguage ? 'selected' : ''}>${displayName}</option>`;
    }).join('');

    // Trigger edition load for selected language
    fetchEditionsByLanguage(state.selectedLanguage);
}

async function fetchEditionsByLanguage(language) {
    try {
        const data = await fetchAPI(`/edition/language/${language}`);
        state.editions = data.filter(ed => ed.format === 'text');
        renderEditionSelect();
    } catch (error) {
        console.error('Error fetching editions:', error);
    }
}

function renderEditionSelect() {
    if (!elements.editionSelect) return;

    if (state.editions.length === 0) {
        elements.editionSelect.innerHTML = '<option value="">No editions available</option>';
        return;
    }

    elements.editionSelect.innerHTML = state.editions.map(edition =>
        `<option value="${edition.identifier}" ${edition.identifier === state.selectedEdition ? 'selected' : ''}>
            ${edition.englishName} (${edition.type})
        </option>`
    ).join('');
}

async function onLanguageChange(e) {
    const language = e.target.value;
    state.selectedLanguage = language;
    localStorage.setItem('selectedLanguage', language);

    await fetchEditionsByLanguage(language);
    updateSettingsDisplay();
}

function onEditionChange(e) {
    const edition = e.target.value;
    state.selectedEdition = edition;
    localStorage.setItem('selectedEdition', edition);
    updateSettingsDisplay();

    // Reload current surah if viewing
    if (state.currentSurah) {
        loadSurah(state.currentSurah.arabic.number);
    }
}

function onFormatChange(e) {
    const format = e.target.value;
    if (format === 'audio') {
        switchTab('listen');
    }
}

function updateSettingsDisplay() {
    if (elements.currentEdition) {
        elements.currentEdition.textContent = state.selectedEdition;
    }
    if (elements.currentLanguage) {
        const langOption = elements.languageSelect?.querySelector(`option[value="${state.selectedLanguage}"]`);
        elements.currentLanguage.textContent = langOption?.textContent || state.selectedLanguage;
    }

    // Update surah language button label
    updateSurahLanguageLabel();
}

// ============================================
// QUICK LANGUAGE SELECTOR (Surah Header)
// ============================================

// Common language names mapping for display
const LANGUAGE_NAMES = {
    'ar': 'Arabic',
    'en': 'English',
    'ur': 'Urdu',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'tr': 'Turkish',
    'id': 'Indonesian',
    'bn': 'Bengali',
    'fa': 'Persian',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hi': 'Hindi',
    'ml': 'Malayalam',
    'ta': 'Tamil',
    'pt': 'Portuguese',
    'it': 'Italian',
    'nl': 'Dutch',
    'pl': 'Polish',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'ms': 'Malay',
    'sw': 'Swahili'
};

// Update the language label in surah header
function updateSurahLanguageLabel() {
    const langLabel = document.getElementById('surah-lang-label');
    if (langLabel) {
        langLabel.textContent = state.selectedLanguage.toUpperCase();
    }
}

// Open quick language selector modal
function openQuickLanguageSelector() {
    const modal = document.getElementById('lang-selector-modal');
    const list = document.getElementById('lang-selector-list');

    if (!modal || !list) return;

    // Render language options
    renderQuickLanguageOptions();

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close quick language selector modal
function closeQuickLanguageSelector() {
    const modal = document.getElementById('lang-selector-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Render language options in the modal
function renderQuickLanguageOptions() {
    const list = document.getElementById('lang-selector-list');
    if (!list) return;

    // Popular languages to show first
    const popularLangs = ['en', 'hi', 'ar', 'ur', 'fr', 'tr', 'id', 'bn', 'fa', 'ru', 'de', 'es', 'ml'];

    // Sort languages: popular first, then others alphabetically
    const sortedLanguages = [...state.languages].sort((a, b) => {
        const aPopular = popularLangs.indexOf(a);
        const bPopular = popularLangs.indexOf(b);

        if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
        if (aPopular !== -1) return -1;
        if (bPopular !== -1) return 1;

        const aName = LANGUAGE_NAMES[a] || a.toUpperCase();
        const bName = LANGUAGE_NAMES[b] || b.toUpperCase();
        return aName.localeCompare(bName);
    });

    list.innerHTML = sortedLanguages.map(lang => {
        const displayName = LANGUAGE_NAMES[lang] || lang.toUpperCase();
        const isActive = lang === state.selectedLanguage;

        return `
            <div class="lang-option ${isActive ? 'active' : ''}" data-lang="${lang}">
                <div class="lang-option-info">
                    <span class="lang-option-name">${displayName}</span>
                    <span class="lang-option-code">${lang}</span>
                </div>
                <div class="lang-option-check">
                    <span class="material-symbols-outlined">check</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    list.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.lang;
            selectQuickLanguage(lang);
        });
    });
}

// Select a language from the quick selector
async function selectQuickLanguage(lang) {
    if (lang === state.selectedLanguage) {
        closeQuickLanguageSelector();
        return;
    }

    // Update state
    state.selectedLanguage = lang;
    localStorage.setItem('selectedLanguage', lang);

    // Fetch editions for this language
    await fetchEditionsByLanguage(lang);

    // Auto-select first edition for the new language
    if (state.editions.length > 0) {
        const firstEdition = state.editions[0].identifier;
        state.selectedEdition = firstEdition;
        localStorage.setItem('selectedEdition', firstEdition);
    }

    // Update displays
    updateSettingsDisplay();
    renderEditionSelect();

    // Also update the language select in More tab if it exists
    if (elements.languageSelect) {
        elements.languageSelect.value = lang;
    }

    // Close modal
    closeQuickLanguageSelector();

    // Reload current surah if viewing
    if (state.currentSurah) {
        showSuccess(`Switched to ${LANGUAGE_NAMES[lang] || lang.toUpperCase()}`);
        loadSurah(state.currentSurah.arabic.number);
    }
}

// Initialize quick language selector events
function initQuickLanguageSelector() {
    // Language button in surah header
    const langBtn = document.getElementById('surah-language-btn');
    if (langBtn) {
        langBtn.addEventListener('click', openQuickLanguageSelector);
    }

    // Close button
    const closeBtn = document.getElementById('lang-selector-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeQuickLanguageSelector);
    }

    // Backdrop click to close
    const backdrop = document.querySelector('.lang-selector-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeQuickLanguageSelector);
    }

    // Update label on init
    updateSurahLanguageLabel();
}

// ============================================
// LISTEN TAB (AUDIO)
// ============================================

// Audio playlist state
const audioState = {
    playlist: [],
    currentIndex: 0,
    isPlaying: false
};

async function fetchAudioEditions() {
    try {
        const data = await fetchAPI('/edition/format/audio');
        state.audioEditions = data;
        renderReciterSelect();
    } catch (error) {
        console.error('Error fetching audio editions:', error);
    }
}

function populateAudioSurahSelect() {
    if (!elements.audioSurahSelect) return;

    elements.audioSurahSelect.innerHTML = '<option value="">-- Select a Surah --</option>' +
        state.surahs.map(surah =>
            `<option value="${surah.number}">${surah.number}. ${surah.englishName} (${surah.name})</option>`
        ).join('');
}

function renderReciterSelect() {
    if (!elements.reciterSelect) return;

    if (state.audioEditions.length === 0) {
        elements.reciterSelect.innerHTML = '<option value="">No reciters available</option>';
        return;
    }

    elements.reciterSelect.innerHTML = state.audioEditions.map(edition =>
        `<option value="${edition.identifier}" ${edition.identifier === state.selectedAudioEdition ? 'selected' : ''}>
            ${edition.englishName}
        </option>`
    ).join('');
}

async function onAudioSurahChange() {
    const surahNumber = elements.audioSurahSelect?.value;
    const reciter = elements.reciterSelect?.value;

    if (surahNumber && reciter) {
        await playAudio(surahNumber, reciter);
    }
}

async function onReciterChange() {
    const reciter = elements.reciterSelect?.value;
    if (reciter) {
        state.selectedAudioEdition = reciter;
        localStorage.setItem('selectedAudioEdition', reciter);
    }

    const surahNumber = elements.audioSurahSelect?.value;
    if (surahNumber && reciter) {
        await playAudio(surahNumber, reciter);
    }
}

async function playAudio(surahNumber, reciterEdition) {
    // Stop any currently playing audio (from read tab)
    stopAllAudio('listen');

    showLoading();

    try {
        const data = await fetchAPI(`/surah/${surahNumber}/${reciterEdition}`);

        // Find the reciter name
        const reciter = state.audioEditions.find(e => e.identifier === reciterEdition);
        const surah = state.surahs.find(s => s.number === parseInt(surahNumber));

        if (elements.nowPlayingSurah) {
            elements.nowPlayingSurah.textContent = surah?.englishName || `Surah ${surahNumber}`;
        }
        if (elements.nowPlayingReciter) {
            elements.nowPlayingReciter.textContent = reciter?.englishName || reciterEdition;
        }

        // Get all ayah audio URLs
        if (data.ayahs && data.ayahs.length > 0) {
            const audioUrls = data.ayahs.map(a => a.audio).filter(Boolean);

            if (audioUrls.length > 0) {
                // Set up the playlist
                audioState.playlist = audioUrls;
                audioState.currentIndex = 0;
                audioState.isPlaying = true;

                // Update UI to show total ayahs
                updateAyahCounter();

                // Show the audio player container
                elements.audioPlayerContainer?.classList.remove('hidden');

                // Play the first ayah
                playCurrentAyah();
            } else {
                showError('No audio available for this selection.');
            }
        } else {
            showError('No audio available for this selection.');
        }
    } catch (error) {
        console.error('Error playing audio:', error);
        showError('Failed to load audio. Please try again.');
    } finally {
        hideLoading();
    }
}

function playCurrentAyah() {
    if (!elements.audioPlayer || audioState.playlist.length === 0) return;

    const audioUrl = audioState.playlist[audioState.currentIndex];
    elements.audioPlayer.src = audioUrl;
    elements.audioPlayer.load();

    updateAyahCounter();

    elements.audioPlayer.play().catch(e => {
        console.log('Autoplay prevented, user must click play');
    });
}

function playNextAyah() {
    if (audioState.currentIndex < audioState.playlist.length - 1) {
        audioState.currentIndex++;
        playCurrentAyah();
    } else {
        // Playlist finished
        audioState.isPlaying = false;
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        }
    }
}

function playPreviousAyah() {
    if (audioState.currentIndex > 0) {
        audioState.currentIndex--;
        playCurrentAyah();
    } else {
        // Restart current ayah from beginning
        if (elements.audioPlayer) {
            elements.audioPlayer.currentTime = 0;
            elements.audioPlayer.play();
        }
    }
}

function updateAyahCounter() {
    const counter = document.getElementById('ayah-counter');
    if (counter && audioState.playlist.length > 0) {
        counter.textContent = `Ayah ${audioState.currentIndex + 1} of ${audioState.playlist.length}`;
    }
}

// ============================================
// AUDIO PLAYER CONTROLS
// ============================================

function initAudioControls() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const audioPlayer = elements.audioPlayer;

    if (playPauseBtn && audioPlayer) {
        playPauseBtn.addEventListener('click', () => {
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        });

        audioPlayer.addEventListener('play', () => {
            audioState.isPlaying = true;
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
        });

        audioPlayer.addEventListener('pause', () => {
            audioState.isPlaying = false;
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        });

        audioPlayer.addEventListener('timeupdate', () => {
            updateProgress();
        });

        audioPlayer.addEventListener('loadedmetadata', () => {
            updateProgress();
        });

        // When an ayah ends, play the next one
        audioPlayer.addEventListener('ended', () => {
            playNextAyah();
        });
    }

    // Previous button
    if (prevBtn) {
        prevBtn.addEventListener('click', playPreviousAyah);
    }

    // Next button
    if (nextBtn) {
        nextBtn.addEventListener('click', playNextAyah);
    }

    // Progress bar seeking
    const progressBar = document.querySelector('#listen-tab .progress-bar');
    if (progressBar && audioPlayer) {
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = percent * audioPlayer.duration;
        });
    }
}

function updateProgress() {
    const audioPlayer = elements.audioPlayer;
    if (!audioPlayer) return;

    const progressFill = document.querySelector('#listen-tab .progress-fill');
    const progressTimes = document.querySelectorAll('#listen-tab .progress-times span');

    if (progressFill && audioPlayer.duration) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFill.style.width = `${percent}%`;
    }

    if (progressTimes.length === 2) {
        progressTimes[0].textContent = formatTime(audioPlayer.currentTime);
        progressTimes[1].textContent = formatTime(audioPlayer.duration || 0);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// READ TAB AUDIO PLAYBACK
// ============================================

// Read audio state (separate from Listen tab)
const readAudioState = {
    playlist: [],
    currentIndex: 0,
    isPlaying: false,
    surahNumber: null,
    surahName: '',
    startAyahOffset: 1 // The actual ayah number of the first item in the playlist
};

function attachReadAudioListeners() {
    // Play Surah button
    const playSurahBtn = document.querySelector('.play-surah-btn');
    if (playSurahBtn) {
        playSurahBtn.addEventListener('click', async () => {
            const surahNumber = playSurahBtn.dataset.surah;
            await playReadAudio(surahNumber, 1, true); // Start from ayah 1, play whole surah
        });
    }

    // Individual ayah play buttons
    document.querySelectorAll('.ayah-play-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const surahNumber = btn.dataset.surah;
            const ayahNumber = parseInt(btn.dataset.ayah);
            await playReadAudio(surahNumber, ayahNumber, false); // Play single ayah
        });
    });

    // Inline player controls
    const inlinePlayPauseBtn = document.getElementById('inline-play-pause-btn');
    const inlinePrevBtn = document.getElementById('inline-prev-btn');
    const inlineNextBtn = document.getElementById('inline-next-btn');
    const inlineCloseBtn = document.getElementById('inline-close-btn');
    const readAudioPlayer = document.getElementById('read-audio-player');

    if (inlinePlayPauseBtn && readAudioPlayer) {
        inlinePlayPauseBtn.addEventListener('click', () => {
            if (readAudioPlayer.paused) {
                readAudioPlayer.play();
            } else {
                readAudioPlayer.pause();
            }
        });

        readAudioPlayer.addEventListener('play', () => {
            readAudioState.isPlaying = true;
            inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
        });

        readAudioPlayer.addEventListener('pause', () => {
            readAudioState.isPlaying = false;
            inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        });

        readAudioPlayer.addEventListener('ended', () => {
            if (readAudioState.playlist.length > 1 && readAudioState.currentIndex < readAudioState.playlist.length - 1) {
                // Play next ayah if we're in surah mode
                playNextReadAyah();
            } else {
                // Single ayah finished or end of surah
                readAudioState.isPlaying = false;
                inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
                updateReadPlayerUI();
            }
        });
    }

    if (inlinePrevBtn) {
        inlinePrevBtn.addEventListener('click', playPreviousReadAyah);
    }

    if (inlineNextBtn) {
        inlineNextBtn.addEventListener('click', playNextReadAyah);
    }

    if (inlineCloseBtn) {
        inlineCloseBtn.addEventListener('click', closeReadPlayer);
    }
}

async function playReadAudio(surahNumber, startAyah, playWholeSurah) {
    // Stop any currently playing audio (from listen tab)
    stopAllAudio('read');

    showLoading();

    try {
        const reciterEdition = state.selectedAudioEdition || 'ar.alafasy';
        const data = await fetchAPI(`/surah/${surahNumber}/${reciterEdition}`);
        const surah = state.surahs.find(s => s.number === parseInt(surahNumber));

        if (data.ayahs && data.ayahs.length > 0) {
            if (playWholeSurah) {
                // Set up playlist for entire surah
                readAudioState.playlist = data.ayahs.map(a => a.audio).filter(Boolean);
                readAudioState.currentIndex = 0;
                readAudioState.startAyahOffset = 1; // Surah starts from ayah 1

                // Track full surah playback
                trackEvent('audio-play-surah', {
                    surahNumber: surahNumber,
                    surahName: surah?.englishName,
                    reciter: reciterEdition
                });
            } else {
                // Single ayah - find the ayah by number
                const ayahIndex = data.ayahs.findIndex(a => a.numberInSurah === startAyah);
                if (ayahIndex === -1) {
                    showError('Ayah not found');
                    return;
                }
                readAudioState.playlist = [data.ayahs[ayahIndex].audio];
                readAudioState.currentIndex = 0;
                readAudioState.startAyahOffset = startAyah; // Store the actual ayah number

                // Track single ayah playback
                trackEvent('audio-play-ayah', {
                    surahNumber: surahNumber,
                    ayahNumber: startAyah,
                    reciter: reciterEdition
                });
            }

            readAudioState.surahNumber = surahNumber;
            readAudioState.surahName = surah?.englishName || `Surah ${surahNumber}`;
            readAudioState.isPlaying = true;

            // Show inline player
            showReadPlayer();
            updateReadPlayerUI();
            playCurrentReadAyah();
        } else {
            showError('No audio available for this selection.');
        }
    } catch (error) {
        console.error('Error loading read audio:', error);
        showError('Failed to load audio. Please try again.');
    } finally {
        hideLoading();
    }
}

function playCurrentReadAyah() {
    const readAudioPlayer = document.getElementById('read-audio-player');
    if (!readAudioPlayer || readAudioState.playlist.length === 0) return;

    const audioUrl = readAudioState.playlist[readAudioState.currentIndex];
    readAudioPlayer.src = audioUrl;
    readAudioPlayer.load();

    updateReadPlayerUI();
    highlightCurrentAyah();

    readAudioPlayer.play().catch(e => {
        console.log('Autoplay prevented, user must click play');
    });
}

function playNextReadAyah() {
    if (readAudioState.currentIndex < readAudioState.playlist.length - 1) {
        readAudioState.currentIndex++;
        playCurrentReadAyah();
    }
}

function playPreviousReadAyah() {
    if (readAudioState.currentIndex > 0) {
        readAudioState.currentIndex--;
        playCurrentReadAyah();
    } else {
        const readAudioPlayer = document.getElementById('read-audio-player');
        if (readAudioPlayer) {
            readAudioPlayer.currentTime = 0;
            readAudioPlayer.play();
        }
    }
}

function showReadPlayer() {
    const inlinePlayer = document.getElementById('read-inline-player');
    if (inlinePlayer) {
        inlinePlayer.classList.remove('hidden');
    }
}

function closeReadPlayer() {
    const inlinePlayer = document.getElementById('read-inline-player');
    const readAudioPlayer = document.getElementById('read-audio-player');

    if (readAudioPlayer) {
        readAudioPlayer.pause();
        readAudioPlayer.src = '';
    }

    if (inlinePlayer) {
        inlinePlayer.classList.add('hidden');
    }

    readAudioState.playlist = [];
    readAudioState.currentIndex = 0;
    readAudioState.isPlaying = false;

    // Remove highlight from all ayahs
    document.querySelectorAll('.ayah-card.playing').forEach(card => {
        card.classList.remove('playing');
    });
}

function updateReadPlayerUI() {
    const playerText = document.getElementById('inline-player-text');
    if (playerText) {
        // Calculate the actual ayah number using the offset
        const actualAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;
        if (readAudioState.playlist.length > 1) {
            const totalAyahs = readAudioState.startAyahOffset + readAudioState.playlist.length - 1;
            playerText.textContent = `${readAudioState.surahName} - Ayah ${actualAyahNumber} of ${totalAyahs}`;
        } else {
            playerText.textContent = `${readAudioState.surahName} - Ayah ${actualAyahNumber}`;
        }
    }
}

function highlightCurrentAyah() {
    // Remove previous highlight
    document.querySelectorAll('.ayah-card.playing').forEach(card => {
        card.classList.remove('playing');
    });

    // Add highlight to current ayah - use startAyahOffset to get the actual ayah number
    const currentAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;
    const currentAyahCard = document.querySelector(`.ayah-card[data-ayah-number="${currentAyahNumber}"]`);
    if (currentAyahCard) {
        currentAyahCard.classList.add('playing');
        currentAyahCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ============================================
// PWA FUNCTIONALITY
// ============================================

let deferredPrompt = null;

function initPWA() {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker registered:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    }

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // Show install banner
        elements.installBanner?.classList.remove('hidden');

        // Handle install button click
        elements.installBtn?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('Install prompt outcome:', outcome);
                deferredPrompt = null;
                elements.installBanner?.classList.add('hidden');
            }
        });
    });

    // Handle successful install
    window.addEventListener('appinstalled', () => {
        console.log('PWA installed successfully');
        elements.installBanner?.classList.add('hidden');
        deferredPrompt = null;
    });
}

// ============================================
// MORE TAB - Islamic Features
// ============================================

// State for More tab features
const moreState = {
    allahNames: null,
    hadithBooks: {},
    prophetStories: null,
    wuduGuide: null,
    islamicTerms: null,
    islamicFacts: null,
    currentHadithBook: null,
    currentHadithSection: null
};

// Initialize More tab features
function initMoreTab() {
    // Feature card click handlers
    document.querySelectorAll('.more-feature-card').forEach(card => {
        card.addEventListener('click', () => {
            const feature = card.dataset.feature;
            openFeature(feature);
        });
    });

    // Back navigation
    document.querySelectorAll('.back-to-more').forEach(btn => {
        btn.addEventListener('click', showMoreHub);
    });

    document.querySelector('.back-to-names')?.addEventListener('click', () => {
        showFeatureView('names-view');
    });

    document.querySelector('.back-to-hadith')?.addEventListener('click', () => {
        showFeatureView('hadith-view');
    });

    document.querySelector('.back-to-hadith-book')?.addEventListener('click', () => {
        showFeatureView('hadith-book-view');
    });

    document.querySelector('.back-to-prophets')?.addEventListener('click', () => {
        showFeatureView('prophets-view');
    });
}

function showMoreHub() {
    // Hide all feature views
    document.querySelectorAll('#more-tab .feature-view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById('more-hub-view')?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

function showFeatureView(viewId) {
    document.querySelectorAll('#more-tab > div').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(viewId)?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

async function openFeature(feature) {
    showLoading();

    try {
        switch (feature) {
            case 'names':
                await loadAllahNames();
                showFeatureView('names-view');
                break;
            case 'hadith':
                renderHadithBooks();
                showFeatureView('hadith-view');
                break;
            case 'prophets':
                await loadProphetStories();
                showFeatureView('prophets-view');
                break;
            case 'wudu':
                await loadWuduGuide();
                showFeatureView('wudu-view');
                break;
            case 'terms':
                await loadIslamicTerms();
                showFeatureView('terms-view');
                break;
            case 'facts':
                await loadIslamicFacts();
                showFeatureView('facts-view');
                break;
        }
    } catch (error) {
        console.error('Error loading feature:', error);
        showError('Failed to load feature');
    } finally {
        hideLoading();
    }
}

// ============================================
// 99 NAMES OF ALLAH
// ============================================

async function loadAllahNames() {
    if (moreState.allahNames) {
        renderAllahNames();
        return;
    }

    const response = await fetch('./islamic_data/jsons/list_allah_names.json');
    moreState.allahNames = await response.json();
    renderAllahNames();
}

function renderAllahNames() {
    const container = document.getElementById('names-list');
    if (!container || !moreState.allahNames) return;

    container.innerHTML = '';

    Object.entries(moreState.allahNames).forEach(([num, data]) => {
        const card = document.createElement('div');
        card.className = 'name-card';
        card.innerHTML = `
            <span class="name-number">#${num}</span>
            <span class="name-arabic">${data.Information?.transliteration_ar || ''}</span>
            <span class="name-transliteration">${data.Name || ''}</span>
            <span class="name-meaning">${data.Information?.transliteration_eng || ''}</span>
        `;
        card.addEventListener('click', () => showNameDetail(num, data));
        container.appendChild(card);
    });
}

function showNameDetail(num, data) {
    const titleEl = document.getElementById('name-detail-title');
    const contentEl = document.getElementById('name-detail-content');

    if (titleEl) titleEl.textContent = data.Name || '';

    if (contentEl) {
        contentEl.innerHTML = `
            <div class="name-detail-header">
                <p class="name-detail-arabic">${data.Information?.transliteration_ar || ''}</p>
                <p class="name-detail-transliteration">${data.Name || ''}</p>
                <p class="name-detail-meaning">${data.Information?.transliteration_eng || ''}</p>
            </div>
            
            <div class="name-detail-section">
                <h4>Description</h4>
                <p>${data.Information?.description || 'No description available.'}</p>
            </div>
            
            ${data.Information?.summary ? `
            <div class="name-detail-section">
                <h4>Summary</h4>
                <p>${data.Information.summary}</p>
            </div>
            ` : ''}
            
            ${data.Information?.['mentions-from-quran-hadith'] ? `
            <div class="name-detail-section">
                <h4>From Quran & Hadith</h4>
                <p>${data.Information['mentions-from-quran-hadith']}</p>
            </div>
            ` : ''}
        `;
    }

    showFeatureView('name-detail-view');
}

// ============================================
// HADITH COLLECTIONS
// ============================================

const HADITH_BOOKS = [
    { id: 'bukhari', name: 'Sahih al-Bukhari', file: 'book_bukhari.json' },
    { id: 'muslim', name: 'Sahih Muslim', file: 'book_muslim.json' },
    { id: 'tirmidhi', name: 'Jami at-Tirmidhi', file: 'book_tirmidhi.json' },
    { id: 'abudawud', name: 'Sunan Abu Dawud', file: 'book_abudawud.json' },
    { id: 'nasai', name: 'Sunan an-Nasai', file: 'book_nasai.json' },
    { id: 'ibnmajah', name: 'Sunan Ibn Majah', file: 'book_ibnmajah.json' },
    { id: 'malik', name: "Muwatta Malik", file: 'book_malik.json' }
];

function renderHadithBooks() {
    const container = document.getElementById('hadith-books-list');
    if (!container) return;

    container.innerHTML = HADITH_BOOKS.map(book => `
        <div class="hadith-book-card" data-book="${book.id}" data-file="${book.file}">
            <div class="hadith-book-icon">
                <span class="material-symbols-outlined">library_books</span>
            </div>
            <div class="hadith-book-info">
                <h3>${book.name}</h3>
                <p>Click to browse</p>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        </div>
    `).join('');

    container.querySelectorAll('.hadith-book-card').forEach(card => {
        card.addEventListener('click', () => loadHadithBook(card.dataset.book, card.dataset.file));
    });
}

async function loadHadithBook(bookId, filename) {
    showLoading();

    try {
        if (!moreState.hadithBooks[bookId]) {
            const response = await fetch(`./islamic_data/jsons/hadiths/${filename}`);
            moreState.hadithBooks[bookId] = await response.json();
        }

        moreState.currentHadithBook = bookId;
        renderHadithSections(bookId);
        showFeatureView('hadith-book-view');
    } catch (error) {
        console.error('Error loading hadith book:', error);
        showError('Failed to load hadith book');
    } finally {
        hideLoading();
    }
}

function renderHadithSections(bookId) {
    const book = moreState.hadithBooks[bookId];
    const container = document.getElementById('hadith-sections-list');
    const titleEl = document.getElementById('hadith-book-title');

    if (!container || !book) return;

    if (titleEl) titleEl.textContent = book.metadata?.name || 'Hadith';

    const sections = book.metadata?.sections || {};

    container.innerHTML = Object.entries(sections).map(([num, name]) => `
        <div class="hadith-section-card" data-section="${num}">
            <div class="hadith-book-icon">
                <span class="material-symbols-outlined">bookmark</span>
            </div>
            <div class="hadith-book-info">
                <h3>Section ${num}</h3>
                <p>${name}</p>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        </div>
    `).join('');

    container.querySelectorAll('.hadith-section-card').forEach(card => {
        card.addEventListener('click', () => loadHadithSection(bookId, card.dataset.section));
    });
}

function loadHadithSection(bookId, sectionNum) {
    const book = moreState.hadithBooks[bookId];
    const container = document.getElementById('hadiths-list');
    const titleEl = document.getElementById('hadith-section-title');

    if (!container || !book) return;

    const sectionName = book.metadata?.sections?.[sectionNum] || `Section ${sectionNum}`;
    if (titleEl) titleEl.textContent = sectionName;

    // Get section details for hadith range
    const sectionDetails = book.metadata?.section_details?.[sectionNum];
    const hadiths = book.hadiths || [];

    // Filter hadiths by section
    let filteredHadiths = hadiths;
    if (sectionDetails) {
        const start = sectionDetails.hadithnumber_first;
        const end = sectionDetails.hadithnumber_last;
        filteredHadiths = hadiths.filter(h => h.hadithnumber >= start && h.hadithnumber <= end);
    }

    // Limit to first 50 for performance
    const displayHadiths = filteredHadiths.slice(0, 50);
    const collectionName = book.metadata?.name || bookId;

    container.innerHTML = displayHadiths.map(hadith => {
        const hadithId = `hadith-${bookId}-${hadith.hadithnumber}`;
        const hadithIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('hadith', hadithId);
        return `
        <div class="hadith-card">
            <div class="hadith-card-header">
                <p class="hadith-number">Hadith #${hadith.hadithnumber}</p>
                <div class="hadith-card-actions">
                    <button class="hadith-bookmark-btn ${hadithIsBookmarked ? 'bookmarked' : ''}"
                        data-hadith-id="${hadithId}"
                        data-collection="${encodeURIComponent(collectionName)}"
                        data-book="${encodeURIComponent(hadith.reference?.book || '')}"
                        data-number="${hadith.hadithnumber}"
                        data-text="${encodeURIComponent(hadith.text || '')}">
                        <span class="material-symbols-outlined">${hadithIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                    </button>
                    <button class="hadith-share-btn"
                        data-collection="${encodeURIComponent(collectionName)}"
                        data-number="${hadith.hadithnumber}"
                        data-text="${encodeURIComponent(hadith.text || '')}">
                        <span class="material-symbols-outlined">share</span>
                    </button>
                </div>
            </div>
            <p class="hadith-text">${hadith.text}</p>
            <p class="hadith-reference">Book ${hadith.reference?.book}, Hadith ${hadith.reference?.hadith}</p>
        </div>
    `}).join('');

    if (filteredHadiths.length > 50) {
        container.innerHTML += `<p style="text-align: center; color: var(--text-muted); padding: 1rem;">Showing first 50 of ${filteredHadiths.length} hadiths</p>`;
    }

    showFeatureView('hadith-section-view');
}

// ============================================
// PROPHET STORIES
// ============================================

async function loadProphetStories() {
    if (moreState.prophetStories) {
        renderProphetStories();
        return;
    }

    const response = await fetch('./islamic_data/jsons/prophet_stories.json');
    moreState.prophetStories = await response.json();
    renderProphetStories();
}

function renderProphetStories() {
    const container = document.getElementById('prophets-list');
    if (!container || !moreState.prophetStories) return;

    container.innerHTML = '';

    Object.entries(moreState.prophetStories).forEach(([num, data]) => {
        // Get the prophet name (it's the first key in the object)
        const prophetName = Object.keys(data)[0];
        const prophetData = data[prophetName];

        const card = document.createElement('div');
        card.className = 'prophet-card';
        card.innerHTML = `
            <div class="prophet-icon">${num}</div>
            <div class="prophet-info">
                <h3>${prophetName}</h3>
                <p>${prophetData?.Intro || ''}</p>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        `;
        card.addEventListener('click', () => showProphetStory(prophetName, prophetData));
        container.appendChild(card);
    });
}

function showProphetStory(name, data) {
    const titleEl = document.getElementById('prophet-story-title');
    const contentEl = document.getElementById('prophet-story-content');

    if (titleEl) titleEl.textContent = name;

    if (contentEl) {
        let storyHtml = `
            <div class="prophet-story-header">
                <h2>${name}</h2>
            </div>
            <div class="prophet-story-intro">${data?.Intro || ''}</div>
        `;

        // Add full story sections
        const fullStory = data?.['Full Story'] || {};
        Object.entries(fullStory).forEach(([sectionTitle, content]) => {
            let sectionContent = '';
            if (Array.isArray(content)) {
                sectionContent = content.map(p => `<p>${p}</p>`).join('');
            } else if (typeof content === 'string') {
                sectionContent = `<p>${content}</p>`;
            }

            storyHtml += `
                <div class="prophet-story-section">
                    <h4>${sectionTitle}</h4>
                    ${sectionContent}
                </div>
            `;
        });

        contentEl.innerHTML = storyHtml;
    }

    showFeatureView('prophet-story-view');
}

// ============================================
// WUDU GUIDE
// ============================================

async function loadWuduGuide() {
    if (moreState.wuduGuide) {
        renderWuduGuide();
        return;
    }

    const response = await fetch('./islamic_data/jsons/wudu-guide.json');
    moreState.wuduGuide = await response.json();
    renderWuduGuide();
}

function renderWuduGuide() {
    const container = document.getElementById('wudu-content');
    if (!container || !moreState.wuduGuide) return;

    const guide = moreState.wuduGuide['Wudu-Guide'];
    if (!guide) return;

    let html = '';

    // Introduction
    const intro = guide.Introduction;
    if (intro) {
        html += `<div class="wudu-intro">
            <h3>Introduction</h3>
            ${renderWuduIntroSection(intro)}
        </div>`;
    }

    // Steps
    const howTo = guide['How to Perform Wudu\''];
    if (howTo) {
        const stepsObj = howTo['THE FOLLOWING STEPS MUST BE OBSERVED IN ORDER (TARTEEB).'];
        if (stepsObj) {
            Object.entries(stepsObj).forEach(([num, stepData]) => {
                const stepKey = Object.keys(stepData)[0];
                const stepContent = stepData[stepKey];

                html += `
                    <div class="wudu-step">
                        <div class="wudu-step-number">${num}</div>
                        <div class="wudu-step-content">
                            <h4>${stepKey.replace('Step ' + num + ' - ', '')}</h4>
                            <p>${Array.isArray(stepContent) ? stepContent.join(' ') : stepContent}</p>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Mandatory Rules
    const rules = guide['Mandatory-Rules'];
    if (rules) {
        const nullifyActions = rules['Actions which Nullify the Wudu'];
        if (nullifyActions) {
            html += `
                <div class="wudu-note">
                    <h4>Actions which Nullify Wudu</h4>
                    <p>${Array.isArray(nullifyActions) ? nullifyActions.join(' ') : nullifyActions}</p>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function renderWuduIntroSection(intro) {
    let html = '';
    Object.entries(intro).forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).forEach(([subKey, subValue]) => {
                const text = Array.isArray(subValue) ? subValue.join(' ') : subValue;
                html += `<p><strong>${subKey}:</strong> ${text}</p>`;
            });
        } else {
            const text = Array.isArray(value) ? value.join(' ') : value;
            html += `<p><strong>${key}:</strong> ${text}</p>`;
        }
    });
    return html;
}

// ============================================
// ISLAMIC TERMS
// ============================================

async function loadIslamicTerms() {
    if (moreState.islamicTerms) {
        renderIslamicTerms();
        return;
    }

    const response = await fetch('./islamic_data/jsons/islamic-terms.json');
    moreState.islamicTerms = await response.json();
    renderIslamicTerms();
    initTermsSearch();
}

function renderIslamicTerms(filterLetter = null, searchQuery = '') {
    const alphabetContainer = document.getElementById('terms-alphabet');
    const termsContainer = document.getElementById('terms-list');

    if (!alphabetContainer || !termsContainer || !moreState.islamicTerms) return;

    // Get all letters
    const letters = moreState.islamicTerms.map(item => Object.keys(item)[0]);

    // Render alphabet tabs
    alphabetContainer.innerHTML = letters.map(letter =>
        `<button class="${filterLetter === letter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');

    alphabetContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const letter = btn.dataset.letter;
            renderIslamicTerms(letter);
        });
    });

    // Render terms
    let allTerms = [];
    moreState.islamicTerms.forEach(letterObj => {
        const letter = Object.keys(letterObj)[0];
        const terms = letterObj[letter] || [];

        if (filterLetter && letter !== filterLetter) return;

        terms.forEach(term => {
            if (searchQuery && !term.Term.toLowerCase().includes(searchQuery.toLowerCase())) return;
            allTerms.push(term);
        });
    });

    termsContainer.innerHTML = allTerms.map(term => `
        <div class="term-card">
            <h3>${term.Term}</h3>
            <p>${term.Definition}</p>
        </div>
    `).join('');
}

function initTermsSearch() {
    const searchInput = document.getElementById('terms-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderIslamicTerms(null, e.target.value);
        });
    }
}

// ============================================
// ISLAMIC FACTS
// ============================================

async function loadIslamicFacts() {
    if (moreState.islamicFacts) {
        renderIslamicFacts();
        return;
    }

    const response = await fetch('./islamic_data/jsons/islamic-facts.json');
    moreState.islamicFacts = await response.json();
    renderIslamicFacts();
}

function renderIslamicFacts() {
    const container = document.getElementById('facts-list');
    if (!container || !moreState.islamicFacts) return;

    const facts = Object.keys(moreState.islamicFacts);

    container.innerHTML = facts.map(fact => `
        <div class="fact-card">
            <div class="fact-icon">
                <span class="material-symbols-outlined">lightbulb</span>
            </div>
            <p>${fact}</p>
        </div>
    `).join('');
}

// Initialize More tab when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMoreTab, 100);
    setTimeout(initDuaTab, 100);
});

// ============================================
// DUA TAB - Dua & Dhikr Features
// ============================================

// State for Dua tab
const duaState = {
    categories: {
        'daily-dua': { name: 'Daily Duas', data: null },
        'morning-dhikr': { name: 'Morning Adhkar', data: null },
        'evening-dhikr': { name: 'Evening Adhkar', data: null },
        'dhikr-after-salah': { name: 'After Salah', data: null },
        'selected-dua': { name: 'Selected Duas', data: null }
    },
    currentCategory: null,
    currentDua: null
};

function initDuaTab() {
    // Category header click handlers (for expand/collapse)
    document.querySelectorAll('.dua-category-header').forEach(header => {
        header.addEventListener('click', async (e) => {
            const card = header.closest('.dua-category-card');
            if (!card) return;

            const category = card.dataset.category;
            const isExpanded = card.classList.contains('expanded');

            if (isExpanded) {
                // Collapse
                card.classList.remove('expanded');
            } else {
                // Expand and load data
                card.classList.add('expanded');
                await loadDuasIntoCategory(category, card);
            }
        });
    });

    // Search functionality
    const searchInput = document.getElementById('dua-search-input');
    const suggestionsBox = document.getElementById('dua-search-suggestions');

    if (searchInput && suggestionsBox) {
        let searchTimeout;

        // Input handler
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.toLowerCase().trim();

            if (query.length === 0) {
                suggestionsBox.classList.add('hidden');
                suggestionsBox.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(() => {
                updateSearchSuggestions(query);
            }, 300);
        });

        // Focus handler - show suggestions if input has value
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length > 0) {
                updateSearchSuggestions(searchInput.value.trim());
            }
        });

        // Click outside handler to close suggestions
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }

    // Back navigation - attach to all back buttons
    document.querySelectorAll('.back-to-dua-categories').forEach(btn => {
        btn.addEventListener('click', showDuaCategories);
    });
}

// Load duas into the expandable section of a category card
// Load duas into the expandable section of a category card
async function loadDuasIntoCategory(category, card) {
    const itemsContainer = card.querySelector('.dua-category-items');
    if (!itemsContainer) return;

    // Check if already loaded
    if (itemsContainer.querySelector('.dua-item') || itemsContainer.querySelector('.dua-group')) {
        return; // Already has items
    }

    const categoryInfo = duaState.categories[category];
    if (!categoryInfo) return;

    try {
        // Load data if not cached
        if (!categoryInfo.data) {
            const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
            const json = await response.json();

            // Handle grouped data vs flat data
            if (Array.isArray(json) && json.length > 0 && json[0].items) {
                // It's grouped! Flatten for internal use but store structure for rendering
                categoryInfo.groupedData = json;

                // Flatten for linear indexing
                const flatDuas = [];
                json.forEach(group => {
                    group.items.forEach(item => {
                        flatDuas.push(item);
                    });
                });
                categoryInfo.data = flatDuas; // Store flattened list as primary data
            } else {
                // It's already flat
                categoryInfo.data = json;
            }
        }

        // Render based on structure
        if (categoryInfo.groupedData) {
            // Render Groups
            let globalIndex = 0;
            itemsContainer.innerHTML = categoryInfo.groupedData.map(group => `
                <div class="dua-group">
                    <div class="dua-group-header">
                        <div class="dua-group-label">
                            ${group.icon ? `<span class="material-symbols-outlined">${group.icon}</span>` : ''}
                            ${group.title}
                        </div>
                        <span class="material-symbols-outlined dua-group-toggle">expand_more</span>
                    </div>
                    <div class="dua-group-list">
                        ${group.items.map((dua, i) => {
                const currentIndex = globalIndex++;
                return `
                            <div class="dua-item" data-category="${category}" data-dua-index="${currentIndex}">
                                <div class="dua-item-info">
                                    <span class="dua-item-title">${dua.name || dua.title}</span>
                                    ${dua.reference ? `<span class="dua-item-tag">${dua.reference}</span>` : ''}
                                </div>
                                <div class="dua-item-actions">
                                    <button class="dua-item-open">
                                        <span class="material-symbols-outlined">arrow_forward_ios</span>
                                    </button>
                                </div>
                            </div>`;
            }).join('')}
                    </div>
                </div>
            `).join('');

            // Add collapse/expand handlers
            itemsContainer.querySelectorAll('.dua-group-header').forEach(header => {
                header.addEventListener('click', () => {
                    const group = header.parentElement;
                    group.classList.toggle('expanded');
                });
            });

        } else {
            // Render Flat List (Legacy/Other categories)
            const duas = categoryInfo.data;
            itemsContainer.innerHTML = duas.map((dua, index) => `
                <div class="dua-item" data-category="${category}" data-dua-index="${index}">
                    <div class="dua-item-info">
                        <span class="dua-item-title">${dua.name || dua.title || `Dua ${index + 1}`}</span>
                        ${dua.reference ? `<span class="dua-item-tag">${dua.reference}</span>` : ''}
                    </div>
                    <div class="dua-item-actions">
                        <button class="dua-item-open">
                            <span class="material-symbols-outlined">arrow_forward_ios</span>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Add click handlers to new items (works for both structures)
        itemsContainer.querySelectorAll('.dua-item').forEach(item => {
            item.addEventListener('click', () => {
                const duaIndex = parseInt(item.dataset.duaIndex);
                const cat = item.dataset.category;
                openDuaDetail(cat, duaIndex);
            });
        });

        // Update count
        const countEl = card.querySelector('.dua-category-count');
        if (countEl) {
            countEl.textContent = `${categoryInfo.data.length} Duas`;
        }

    } catch (error) {
        console.error('Error loading duas:', error);
        itemsContainer.innerHTML = `
            <div class="dua-items-loading">
                <span>Failed to load duas</span>
            </div>
        `;
    }
}

// Open dua detail view
function openDuaDetail(category, index) {
    const categoryInfo = duaState.categories[category];
    if (!categoryInfo || !categoryInfo.data) return;

    const dua = categoryInfo.data[index];
    if (!dua) return;

    duaState.currentCategory = category;
    duaState.currentDua = dua;

    showDuaDetail(dua);
}

// Update search suggestions dropdown
async function updateSearchSuggestions(query) {
    const suggestionsBox = document.getElementById('dua-search-suggestions');
    if (!suggestionsBox) return;

    // Show loading state if needed, or just keep previous results until new ones are ready
    // Ensure data is loaded
    await loadAllDuaData();

    // Flatten all duas
    const allDuas = [];
    Object.entries(duaState.categories).forEach(([catKey, catInfo]) => {
        if (catInfo.data) {
            catInfo.data.forEach(dua => {
                allDuas.push({
                    ...dua,
                    categoryName: catInfo.name,
                    categoryKey: catKey // Store key for potential use
                });
            });
        }
    });

    // Filter
    const results = allDuas.filter(dua => {
        const title = (dua.title || dua.name || '').toLowerCase();
        const translation = (dua.translation || '').toLowerCase();
        const arabic = (dua.arabic || '').toLowerCase();
        // We can include benefits in search but maybe prioritize title matches in sorting

        return title.includes(query) ||
            translation.includes(query) ||
            arabic.includes(query);
    }).slice(0, 10); // Limit to 10 suggestions

    if (results.length === 0) {
        suggestionsBox.innerHTML = `
            <div style="padding: 12px 16px; color: var(--text-muted); font-size: 0.875rem; text-align: center;">
                No results found
            </div>
        `;
        suggestionsBox.classList.remove('hidden');
        return;
    }

    // Render suggestions
    suggestionsBox.innerHTML = results.map(dua => `
        <div class="dua-suggestion-item">
            <div class="dua-suggestion-icon">
                <span class="material-symbols-outlined">menu_book</span>
            </div>
            <div class="dua-suggestion-content">
                <div class="dua-suggestion-title">${dua.title || dua.name}</div>
                <div class="dua-suggestion-preview">${dua.categoryName} • ${dua.translation.substring(0, 40)}...</div>
            </div>
        </div>
    `).join('');

    suggestionsBox.classList.remove('hidden');

    // Add click handlers
    const items = suggestionsBox.querySelectorAll('.dua-suggestion-item');
    items.forEach((item, index) => {
        item.addEventListener('click', () => {
            showDuaDetail(results[index]);
            suggestionsBox.classList.add('hidden');
        });
    });
}

// Load all dua data for search
async function loadAllDuaData() {
    const promises = Object.keys(duaState.categories).map(async (category) => {
        const categoryInfo = duaState.categories[category];
        if (!categoryInfo.data) {
            try {
                const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
                const json = await response.json();

                // Handle grouped data
                if (Array.isArray(json) && json.length > 0 && json[0].items) {
                    categoryInfo.groupedData = json;
                    const flatDuas = [];
                    json.forEach(group => {
                        group.items.forEach(item => {
                            flatDuas.push(item);
                        });
                    });
                    categoryInfo.data = flatDuas;
                } else {
                    categoryInfo.data = json;
                }
            } catch (err) {
                console.error(`Failed to load ${category}`, err);
                categoryInfo.data = [];
            }
        }
    });

    await Promise.all(promises);
}

// Unused - Old filter function was replaced
// function filterDuaCategories(query) { ... }

function showDuaCategories() {
    // Hide list and detail views, show categories view
    document.getElementById('dua-list-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.add('hidden');
    document.getElementById('dua-categories-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

function showDuaListView() {
    document.getElementById('dua-categories-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.add('hidden');
    document.getElementById('dua-list-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

function showDuaDetailView() {
    document.getElementById('dua-categories-view')?.classList.add('hidden');
    document.getElementById('dua-list-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

async function loadDuaCategory(category) {
    showLoading();

    try {
        const categoryInfo = duaState.categories[category];
        if (!categoryInfo) return;

        // Load data if not cached
        if (!categoryInfo.data) {
            const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
            categoryInfo.data = await response.json();
        }

        duaState.currentCategory = category;

        // Track dua category view
        trackEvent('dua-category-opened', {
            category: category,
            categoryTitle: categoryInfo.title
        });

        renderDuaList(category);
        showDuaListView();
    } catch (error) {
        console.error('Error loading dua category:', error);
        showError('Failed to load duas');
    } finally {
        hideLoading();
    }
}

function renderDuaList(category) {
    const categoryInfo = duaState.categories[category];
    const titleEl = document.getElementById('dua-list-title');
    const container = document.getElementById('dua-list');

    if (!container || !categoryInfo?.data) return;

    if (titleEl) titleEl.textContent = categoryInfo.name;

    container.innerHTML = categoryInfo.data.map((dua, index) => `
        <div class="dua-card" data-index="${index}">
            <h3>${dua.title}</h3>
            <p class="dua-card-arabic">${dua.arabic}</p>
        </div>
    `).join('');

    container.querySelectorAll('.dua-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            showDuaDetail(categoryInfo.data[index]);
        });
    });
}

function showDuaDetail(dua) {
    const titleEl = document.getElementById('dua-detail-title');
    const contentEl = document.getElementById('dua-detail-content');

    if (titleEl) titleEl.textContent = dua.title;

    if (contentEl) {
        const benefits = dua.fawaid || dua.benefits || '';
        const duaId = `dua-${dua.title?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`;
        const duaIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('duas', duaId);

        contentEl.innerHTML = `
            <div class="dua-detail-actions">
                <button class="dua-bookmark-btn ${duaIsBookmarked ? 'bookmarked' : ''}" 
                    data-dua-id="${duaId}"
                    data-title="${encodeURIComponent(dua.title || '')}"
                    data-arabic="${encodeURIComponent(dua.arabic || '')}"
                    data-translation="${encodeURIComponent(dua.translation || '')}"
                    data-source="${encodeURIComponent(dua.source || '')}">
                    <span class="material-symbols-outlined">${duaIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                </button>
                <button class="dua-share-btn"
                    data-title="${encodeURIComponent(dua.title || '')}"
                    data-arabic="${encodeURIComponent(dua.arabic || '')}"
                    data-translation="${encodeURIComponent(dua.translation || '')}"
                    data-source="${encodeURIComponent(dua.source || '')}">
                    <span class="material-symbols-outlined">share</span>
                </button>
            </div>
            
            <div class="dua-detail-arabic">${dua.arabic}</div>
            
            <div class="dua-detail-section">
                <h4>Transliteration</h4>
                <p class="dua-detail-latin">${dua.latin}</p>
            </div>
            
            <div class="dua-detail-section">
                <h4>Translation</h4>
                <p>${dua.translation}</p>
            </div>
            
            ${dua.notes ? `
            <div class="dua-detail-section dua-detail-notes">
                <h4>Notes</h4>
                <p>${dua.notes}</p>
            </div>
            ` : ''}
            
            ${benefits ? `
            <div class="dua-detail-section">
                <h4>Benefits</h4>
                <p>${benefits}</p>
            </div>
            ` : ''}
            
            <p class="dua-detail-source">Source: ${dua.source}</p>
        `;
    }

    duaState.currentDua = dua;
    showDuaDetailView();
}

// ============================================
// GLOBAL MINI PLAYER
// ============================================

// Stop all currently playing audio (ensures only one audio plays at a time)
function stopAllAudio(exceptSource = null) {
    // Stop Listen tab audio
    if (exceptSource !== 'listen' && elements.audioPlayer) {
        elements.audioPlayer.pause();
        elements.audioPlayer.currentTime = 0;
    }

    // Stop Read tab audio
    if (exceptSource !== 'read') {
        const readAudioPlayer = document.getElementById('read-audio-player');
        if (readAudioPlayer) {
            readAudioPlayer.pause();
            readAudioPlayer.currentTime = 0;
        }
    }

    // Clean up read player state if stopping read audio
    if (exceptSource !== 'read') {
        const inlinePlayer = document.getElementById('read-inline-player');
        if (inlinePlayer) {
            inlinePlayer.classList.add('hidden');
        }
        if (typeof readAudioState !== 'undefined') {
            readAudioState.playlist = [];
            readAudioState.currentIndex = 0;
            readAudioState.isPlaying = false;
        }

        // Remove highlight from all ayahs
        document.querySelectorAll('.ayah-card.playing').forEach(card => {
            card.classList.remove('playing');
        });
    }

    // Clean up listen player state if stopping listen audio
    if (exceptSource !== 'listen') {
        elements.audioPlayerContainer?.classList.add('hidden');
        audioState.playlist = [];
        audioState.currentIndex = 0;
        audioState.isPlaying = false;
    }
}

// Global player state that tracks which audio source is active
const globalPlayerState = {
    source: null, // 'listen' or 'read'
    title: '',
    subtitle: '',
    reciter: ''
};

// Initialize global mini player
function initGlobalMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    const miniPlayPause = document.getElementById('mini-play-pause');
    const miniClose = document.getElementById('mini-close');
    const miniExpand = document.getElementById('mini-player-expand');

    const fullModal = document.getElementById('full-player-modal');
    const fullCollapse = document.getElementById('full-player-collapse');
    const fullPlayPause = document.getElementById('full-play-pause');
    const fullPrev = document.getElementById('full-prev-btn');
    const fullNext = document.getElementById('full-next-btn');
    const fullProgressBar = document.getElementById('full-progress-bar');

    // Mini player play/pause
    if (miniPlayPause) {
        miniPlayPause.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleGlobalPlayPause();
        });
    }

    // Mini player close
    if (miniClose) {
        miniClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeGlobalPlayer();
        });
    }

    // Mini player expand
    if (miniExpand) {
        miniExpand.addEventListener('click', () => {
            expandPlayer();
        });
    }

    // Full player collapse
    if (fullCollapse) {
        fullCollapse.addEventListener('click', () => {
            collapsePlayer();
        });
    }

    // Full player play/pause
    if (fullPlayPause) {
        fullPlayPause.addEventListener('click', () => {
            toggleGlobalPlayPause();
        });
    }

    // Full player prev
    if (fullPrev) {
        fullPrev.addEventListener('click', () => {
            if (globalPlayerState.source === 'listen') {
                playPreviousAyah();
            } else if (globalPlayerState.source === 'read') {
                playPreviousReadAyah();
            }
        });
    }

    // Full player next
    if (fullNext) {
        fullNext.addEventListener('click', () => {
            if (globalPlayerState.source === 'listen') {
                playNextAyah();
            } else if (globalPlayerState.source === 'read') {
                playNextReadAyah();
            }
        });
    }

    // Full player progress bar seeking
    if (fullProgressBar) {
        fullProgressBar.addEventListener('click', (e) => {
            const activePlayer = getActiveAudioPlayer();
            if (activePlayer && activePlayer.duration) {
                const rect = fullProgressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                activePlayer.currentTime = percent * activePlayer.duration;
            }
        });
    }

    // Reciter selector button
    const reciterBtn = document.getElementById('full-player-reciter-btn');
    if (reciterBtn) {
        reciterBtn.addEventListener('click', () => {
            openReciterModal();
        });
    }

    // Hook into existing audio players for state updates
    hookAudioPlayerEvents();

    // ========================================
    // INTERACTIVE SWIPE GESTURE HANDLING
    // ========================================

    const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger
    const VELOCITY_THRESHOLD = 0.3; // Minimum velocity for quick swipes

    // --- Mini Player Swipe Up (to expand) ---
    if (miniPlayer) {
        let touchStartY = 0;
        let touchCurrentY = 0;
        let isDragging = false;
        let touchStartedOnButton = false;
        let startTime = 0;

        miniPlayer.addEventListener('touchstart', (e) => {
            const target = e.target;
            touchStartedOnButton = target.closest('button') || target.closest('.mini-control-btn');

            if (!touchStartedOnButton) {
                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                isDragging = true;
                startTime = Date.now();

                // Prepare full modal for animation (show but off-screen)
                fullModal.style.transition = 'none';
                fullModal.classList.remove('hidden');
                fullModal.style.opacity = '0';

                const content = fullModal.querySelector('.full-player-content');
                if (content) {
                    content.style.transition = 'none';
                    content.style.transform = 'translateY(100%)';
                }
            }
        }, { passive: true });

        miniPlayer.addEventListener('touchmove', (e) => {
            if (!isDragging || touchStartedOnButton) return;

            // Prevent page scrolling
            e.preventDefault();

            touchCurrentY = e.touches[0].clientY;
            const deltaY = touchStartY - touchCurrentY; // Positive = swiping up

            if (deltaY > 0) {
                // Calculate progress (0 to 1)
                const maxDrag = window.innerHeight * 0.4;
                const progress = Math.min(deltaY / maxDrag, 1);

                // Animate full modal in
                fullModal.style.opacity = progress.toString();

                const content = fullModal.querySelector('.full-player-content');
                if (content) {
                    const translateY = 100 - (progress * 100);
                    content.style.transform = `translateY(${translateY}%)`;
                }

                // Animate mini player out
                miniPlayer.style.transform = `translateX(-50%) translateY(${-deltaY * 0.3}px) scale(${1 - progress * 0.1})`;
                miniPlayer.style.opacity = (1 - progress * 0.5).toString();
            }
        }, { passive: false });

        miniPlayer.addEventListener('touchend', () => {
            if (!isDragging || touchStartedOnButton) {
                touchStartedOnButton = false;
                return;
            }

            const deltaY = touchStartY - touchCurrentY;
            const absDeltaY = Math.abs(deltaY);
            const elapsed = Date.now() - startTime;
            const velocity = deltaY / elapsed;

            // TAP detection: minimal movement means it's a tap, not a swipe
            const TAP_THRESHOLD = 10; // Max pixels moved to count as a tap
            const isTap = absDeltaY < TAP_THRESHOLD && elapsed < 300;

            // Determine if we should expand (swipe up OR tap)
            const shouldExpand = isTap || deltaY > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

            // Reset mini player with animation
            miniPlayer.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            miniPlayer.style.transform = 'translateX(-50%)';
            miniPlayer.style.opacity = '1';

            const content = fullModal.querySelector('.full-player-content');

            if (shouldExpand) {
                // Complete the expansion
                fullModal.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                fullModal.style.opacity = '1';

                if (content) {
                    content.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    content.style.transform = 'translateY(0)';
                }

                // Update player state
                updateMiniPlayerDisplay();
                updateFullPlayerProgress();
                const activePlayer = getActiveAudioPlayer();
                updateMiniPlayerState(activePlayer?.paused ?? false);
            } else {
                // Cancel - hide full modal
                fullModal.style.transition = 'opacity 0.2s ease';
                fullModal.style.opacity = '0';

                if (content) {
                    content.style.transition = 'transform 0.2s ease';
                    content.style.transform = 'translateY(100%)';
                }

                setTimeout(() => {
                    fullModal.classList.add('hidden');
                }, 200);
            }

            // Cleanup after animation
            setTimeout(() => {
                miniPlayer.style.transition = '';
            }, 300);

            isDragging = false;
            touchStartedOnButton = false;
        });
    }

    // --- Full Player Swipe Down (to collapse) ---
    if (fullModal) {
        const fullContent = fullModal.querySelector('.full-player-content');

        if (fullContent) {
            let touchStartY = 0;
            let touchCurrentY = 0;
            let isDragging = false;
            let startTime = 0;

            fullContent.addEventListener('touchstart', (e) => {
                // Only start drag if touching the content directly (not buttons)
                const target = e.target;
                if (target.closest('button') || target.closest('.full-progress-bar')) return;

                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                isDragging = true;
                startTime = Date.now();

                fullContent.style.transition = 'none';
                fullModal.style.transition = 'none';
            }, { passive: true });

            fullContent.addEventListener('touchmove', (e) => {
                if (!isDragging) return;

                // Prevent page scrolling
                e.preventDefault();

                touchCurrentY = e.touches[0].clientY;
                const deltaY = touchCurrentY - touchStartY; // Positive = swiping down

                if (deltaY > 0) {
                    // Calculate progress
                    const maxDrag = window.innerHeight * 0.4;
                    const progress = Math.min(deltaY / maxDrag, 1);

                    // Animate content down
                    fullContent.style.transform = `translateY(${deltaY}px)`;

                    // Fade out modal background
                    fullModal.style.opacity = (1 - progress * 0.5).toString();
                }
            }, { passive: false });

            fullContent.addEventListener('touchend', () => {
                if (!isDragging) return;

                const deltaY = touchCurrentY - touchStartY;
                const elapsed = Date.now() - startTime;
                const velocity = deltaY / elapsed;

                // Determine if we should collapse
                const shouldCollapse = deltaY > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

                fullContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                fullModal.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

                if (shouldCollapse) {
                    // Complete the collapse
                    fullContent.style.transform = 'translateY(100%)';
                    fullModal.style.opacity = '0';

                    setTimeout(() => {
                        fullModal.classList.add('hidden');
                        fullContent.style.transform = '';
                        fullModal.style.opacity = '';
                        fullContent.style.transition = '';
                        fullModal.style.transition = '';
                    }, 300);
                } else {
                    // Cancel - return to original position
                    fullContent.style.transform = 'translateY(0)';
                    fullModal.style.opacity = '1';

                    setTimeout(() => {
                        fullContent.style.transition = '';
                        fullModal.style.transition = '';
                    }, 300);
                }

                isDragging = false;
            });
        }
    }

}

// Get the currently active audio player element
function getActiveAudioPlayer() {
    if (globalPlayerState.source === 'listen') {
        return elements.audioPlayer;
    } else if (globalPlayerState.source === 'read') {
        return document.getElementById('read-audio-player');
    }
    return null;
}

// Hook events to existing audio players to update mini player
function hookAudioPlayerEvents() {
    // Listen tab audio player
    if (elements.audioPlayer) {
        elements.audioPlayer.addEventListener('play', () => {
            if (globalPlayerState.source === 'listen' || !globalPlayerState.source) {
                globalPlayerState.source = 'listen';
                showMiniPlayer();
                updateMiniPlayerState(false);
            }
        });

        elements.audioPlayer.addEventListener('pause', () => {
            if (globalPlayerState.source === 'listen') {
                updateMiniPlayerState(true);
            }
        });

        elements.audioPlayer.addEventListener('timeupdate', () => {
            if (globalPlayerState.source === 'listen') {
                updateFullPlayerProgress();
            }
        });

        elements.audioPlayer.addEventListener('loadedmetadata', () => {
            if (globalPlayerState.source === 'listen') {
                updateMiniPlayerFromListenTab();
            }
        });
    }
}

// Attach read audio events after the player is created
function hookReadAudioPlayerEvents() {
    const readAudioPlayer = document.getElementById('read-audio-player');
    if (readAudioPlayer) {
        readAudioPlayer.addEventListener('play', () => {
            globalPlayerState.source = 'read';
            showMiniPlayer();
            updateMiniPlayerState(false);
        });

        readAudioPlayer.addEventListener('pause', () => {
            if (globalPlayerState.source === 'read') {
                updateMiniPlayerState(true);
            }
        });

        readAudioPlayer.addEventListener('timeupdate', () => {
            if (globalPlayerState.source === 'read') {
                updateFullPlayerProgress();
            }
        });

        readAudioPlayer.addEventListener('loadedmetadata', () => {
            if (globalPlayerState.source === 'read') {
                updateMiniPlayerFromReadTab();
            }
        });
    }
}

// Show mini player
function showMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    if (miniPlayer) {
        miniPlayer.classList.remove('hidden');
        document.body.classList.add('mini-player-active');
    }
}

// Hide mini player
function hideMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    const fullModal = document.getElementById('full-player-modal');

    if (miniPlayer) {
        miniPlayer.classList.add('hidden');
        document.body.classList.remove('mini-player-active');
    }
    if (fullModal) {
        fullModal.classList.add('hidden');
    }
    globalPlayerState.source = null;
}

// Update mini player paused/playing state
function updateMiniPlayerState(isPaused) {
    const miniPlayer = document.getElementById('global-mini-player');
    const fullModal = document.getElementById('full-player-modal');
    const miniPlayPauseIcon = document.querySelector('#mini-play-pause .material-symbols-outlined');
    const fullPlayPauseIcon = document.querySelector('#full-play-pause .material-symbols-outlined');

    if (isPaused) {
        miniPlayer?.classList.add('paused');
        fullModal?.classList.add('paused');
        if (miniPlayPauseIcon) miniPlayPauseIcon.textContent = 'play_arrow';
        if (fullPlayPauseIcon) fullPlayPauseIcon.textContent = 'play_arrow';
    } else {
        miniPlayer?.classList.remove('paused');
        fullModal?.classList.remove('paused');
        if (miniPlayPauseIcon) miniPlayPauseIcon.textContent = 'pause';
        if (fullPlayPauseIcon) fullPlayPauseIcon.textContent = 'pause';
    }
}

// Update mini player info from Listen tab
function updateMiniPlayerFromListenTab() {
    const surahSelect = document.getElementById('audio-surah-select');
    const reciterSelect = document.getElementById('reciter-select');

    const surahText = surahSelect?.options[surahSelect.selectedIndex]?.text || 'Unknown Surah';
    const reciterText = reciterSelect?.options[reciterSelect.selectedIndex]?.text || 'Unknown Reciter';

    // Parse surah name from "1. Al-Fatiha (الفاتحة)" format
    const surahName = surahText.split(' (')[0] || surahText;

    globalPlayerState.title = surahName;
    globalPlayerState.subtitle = `Ayah ${audioState.currentIndex + 1} of ${audioState.playlist.length}`;
    globalPlayerState.reciter = reciterText;

    updateMiniPlayerDisplay();
}

// Update mini player info from Read tab
function updateMiniPlayerFromReadTab() {
    const actualAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;

    globalPlayerState.title = readAudioState.surahName || 'Unknown Surah';

    if (readAudioState.playlist.length > 1) {
        const totalAyahs = readAudioState.startAyahOffset + readAudioState.playlist.length - 1;
        globalPlayerState.subtitle = `Ayah ${actualAyahNumber} of ${totalAyahs}`;
    } else {
        globalPlayerState.subtitle = `Ayah ${actualAyahNumber}`;
    }

    const reciter = state.audioEditions.find(e => e.identifier === state.selectedAudioEdition);
    globalPlayerState.reciter = reciter?.englishName || 'Unknown Reciter';

    updateMiniPlayerDisplay();
}

// Update the mini player and full player display
function updateMiniPlayerDisplay() {
    const miniTitle = document.getElementById('mini-player-title');
    const miniSubtitle = document.getElementById('mini-player-subtitle');
    const fullTitle = document.getElementById('full-player-title');
    const fullReciter = document.getElementById('full-player-reciter');
    const fullAyah = document.getElementById('full-player-ayah');

    if (miniTitle) miniTitle.textContent = globalPlayerState.title;
    if (miniSubtitle) miniSubtitle.textContent = globalPlayerState.subtitle;
    if (fullTitle) fullTitle.textContent = globalPlayerState.title;
    if (fullReciter) fullReciter.textContent = globalPlayerState.reciter;
    if (fullAyah) fullAyah.textContent = globalPlayerState.subtitle;
}

// Update full player progress bar
function updateFullPlayerProgress() {
    const activePlayer = getActiveAudioPlayer();
    if (!activePlayer) return;

    const progressFill = document.getElementById('full-progress-fill');
    const currentTimeEl = document.getElementById('full-current-time');
    const durationEl = document.getElementById('full-duration');

    if (progressFill && activePlayer.duration) {
        const percent = (activePlayer.currentTime / activePlayer.duration) * 100;
        progressFill.style.width = `${percent}%`;
    }

    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(activePlayer.currentTime);
    }
    if (durationEl) {
        durationEl.textContent = formatTime(activePlayer.duration || 0);
    }
}

// Toggle play/pause for the active audio source
function toggleGlobalPlayPause() {
    const activePlayer = getActiveAudioPlayer();
    if (activePlayer) {
        if (activePlayer.paused) {
            activePlayer.play();
        } else {
            activePlayer.pause();
        }
    }
}

// Close the global player and stop audio
function closeGlobalPlayer() {
    const activePlayer = getActiveAudioPlayer();

    if (activePlayer) {
        activePlayer.pause();
        activePlayer.currentTime = 0;
    }

    // Also close the source-specific players
    if (globalPlayerState.source === 'listen') {
        elements.audioPlayerContainer?.classList.add('hidden');
        audioState.playlist = [];
        audioState.currentIndex = 0;
        audioState.isPlaying = false;
    } else if (globalPlayerState.source === 'read') {
        closeReadPlayer();
    }

    hideMiniPlayer();
}

// Expand mini player to full player
function expandPlayer() {
    const fullModal = document.getElementById('full-player-modal');
    if (fullModal) {
        fullModal.classList.remove('hidden');
        // Update full player info
        updateMiniPlayerDisplay();
        updateFullPlayerProgress();

        // Set paused state correctly
        const activePlayer = getActiveAudioPlayer();
        updateMiniPlayerState(activePlayer?.paused ?? false);
    }
}

// Collapse full player to mini player
function collapsePlayer() {
    const fullModal = document.getElementById('full-player-modal');
    if (fullModal) {
        fullModal.classList.add('hidden');
    }
}

// Override the existing playCurrentAyah to update mini player
const originalPlayCurrentAyah = playCurrentAyah;
playCurrentAyah = function () {
    originalPlayCurrentAyah();
    setTimeout(() => {
        if (globalPlayerState.source === 'listen') {
            updateMiniPlayerFromListenTab();
        }
    }, 100);
};

// Override the existing playCurrentReadAyah to update mini player
const originalPlayCurrentReadAyah = playCurrentReadAyah;
playCurrentReadAyah = function () {
    originalPlayCurrentReadAyah();
    setTimeout(() => {
        if (globalPlayerState.source === 'read') {
            updateMiniPlayerFromReadTab();
        }
    }, 100);
};

// Override attachReadAudioListeners to hook mini player events
const originalAttachReadAudioListeners = attachReadAudioListeners;
attachReadAudioListeners = function () {
    originalAttachReadAudioListeners();
    // Hook read audio player events after it's created
    setTimeout(hookReadAudioPlayerEvents, 100);
};

// Initialize global mini player on app load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGlobalMiniPlayer, 500);
});

// ============================================
// PRAYER TIMES (Al Adhan API)
// ============================================

const PRAYER_API_BASE = 'https://api.aladhan.com/v1';

// Prayer times state
const prayerState = {
    latitude: null,
    longitude: null,
    cityName: 'Your Location',
    timings: null,
    date: null,
    nextPrayer: null,
    countdownInterval: null
};

// Prayer names mapping
const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_IDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Convert 24-hour time to 12-hour AM/PM format
function convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for midnight
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Initialize prayer times
function initPrayerTimes() {
    const requestBtn = document.getElementById('request-location-btn');
    const refreshBtn = document.getElementById('refresh-prayer-times');

    if (requestBtn) {
        requestBtn.addEventListener('click', requestLocation);
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (prayerState.latitude && prayerState.longitude) {
                fetchPrayerTimes(prayerState.latitude, prayerState.longitude);
            }
        });
    }

    // Check if we have saved location
    const savedLat = localStorage.getItem('prayerLat');
    const savedLng = localStorage.getItem('prayerLng');
    const savedCity = localStorage.getItem('prayerCity');

    if (savedLat && savedLng) {
        prayerState.latitude = parseFloat(savedLat);
        prayerState.longitude = parseFloat(savedLng);
        prayerState.cityName = savedCity || 'Your Location';

        // Auto-load prayer times
        showPrayerLoading();
        fetchPrayerTimes(prayerState.latitude, prayerState.longitude);
    }
}

// Request user location
function requestLocation() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser');
        return;
    }

    showPrayerLoading();

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            prayerState.latitude = latitude;
            prayerState.longitude = longitude;

            // Save to localStorage
            localStorage.setItem('prayerLat', latitude.toString());
            localStorage.setItem('prayerLng', longitude.toString());

            // Get city name via reverse geocoding
            await getCityName(latitude, longitude);

            // Fetch prayer times
            await fetchPrayerTimes(latitude, longitude);
        },
        (error) => {
            hidePrayerLoading();
            showLocationRequest();

            let errorMsg = 'Unable to get your location';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'Location permission denied. Please enable location access.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'Location request timed out.';
                    break;
            }
            showError(errorMsg);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes cache
        }
    );
}

// Get city name from coordinates
async function getCityName(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
        );
        const data = await response.json();

        if (data.address) {
            const city = data.address.city ||
                data.address.town ||
                data.address.village ||
                data.address.county ||
                data.address.state ||
                'Your Location';
            const country = data.address.country || '';

            prayerState.cityName = city;
            localStorage.setItem('prayerCity', city);
            localStorage.setItem('prayerCountry', country);
        }
    } catch (error) {
        console.warn('Could not get city name:', error);
        prayerState.cityName = 'Your Location';
    }
}

// Fetch prayer times from Al Adhan API
async function fetchPrayerTimes(lat, lng) {
    try {
        // Get today's date in DD-MM-YYYY format
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}-${month}-${year}`;

        const response = await fetch(
            `${PRAYER_API_BASE}/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=2`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch prayer times');
        }

        const data = await response.json();

        if (data.code === 200 && data.data) {
            prayerState.timings = data.data.timings;
            prayerState.date = data.data.date;

            // Track prayer times view
            trackEvent('prayer-times-viewed', {
                location: data.data.meta?.timezone || 'Unknown'
            });

            // Update UI
            updatePrayerTimesUI();
            showPrayerTimesDisplay();
        } else {
            throw new Error('Invalid API response');
        }
    } catch (error) {
        console.error('Error fetching prayer times:', error);
        showError('Failed to fetch prayer times. Please try again.');
        showLocationRequest();
    } finally {
        hidePrayerLoading();
    }
}

// Update prayer times UI
function updatePrayerTimesUI() {
    if (!prayerState.timings || !prayerState.date) return;

    // Update location name
    const locationCity = document.getElementById('location-city');
    if (locationCity) {
        locationCity.textContent = prayerState.cityName;
    }

    // Update Hijri date
    const hijriDate = document.getElementById('hijri-date');
    const gregorianDate = document.getElementById('gregorian-date');

    if (hijriDate && prayerState.date.hijri) {
        const h = prayerState.date.hijri;
        hijriDate.textContent = `${h.day} ${h.month.en} ${h.year} AH`;
    }

    if (gregorianDate && prayerState.date.gregorian) {
        const g = prayerState.date.gregorian;
        gregorianDate.textContent = `${g.day} ${g.month.en} ${g.year}`;
    }

    // Update prayer times
    const timings = prayerState.timings;

    PRAYER_IDS.forEach((id, index) => {
        const timeEl = document.getElementById(`${id}-time`);
        if (timeEl) {
            const prayerName = PRAYER_NAMES[index];
            const timeValue = timings[prayerName];
            if (timeValue) {
                // Extract just the time and convert to 12-hour format
                const time24 = timeValue.split(' ')[0];
                timeEl.textContent = convertTo12Hour(time24);
            }
        }
    });

    // Calculate and highlight next prayer
    calculateNextPrayer();
}

// Calculate next prayer and start countdown
function calculateNextPrayer() {
    if (!prayerState.timings) return;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let currentPrayer = null;
    let currentPrayerTime = null;
    let nextPrayer = null;
    let nextPrayerTime = null;
    let nextPrayerMinutes = Infinity;

    // Build array of prayers with their times
    const prayerList = PRAYER_NAMES.map((name, index) => {
        const timeStr = prayerState.timings[name];
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(' ')[0].split(':').map(Number);
        return { name, hours, minutes, totalMinutes: hours * 60 + minutes, id: PRAYER_IDS[index] };
    }).filter(Boolean);

    // Find current and next prayer
    for (let i = 0; i < prayerList.length; i++) {
        const prayer = prayerList[i];
        const nextIdx = i + 1 < prayerList.length ? i + 1 : 0;
        const nextPrayerInList = prayerList[nextIdx];

        // Check if we're in the time window of this prayer
        if (prayer.totalMinutes <= currentTime) {
            // Check if next prayer hasn't started yet
            if (nextPrayerInList.totalMinutes > currentTime || nextIdx === 0) {
                currentPrayer = prayer;
                currentPrayerTime = convertTo12Hour(`${String(prayer.hours).padStart(2, '0')}:${String(prayer.minutes).padStart(2, '0')}`);
            }
        }

        // Find the next upcoming prayer
        if (prayer.totalMinutes > currentTime && prayer.totalMinutes < nextPrayerMinutes) {
            nextPrayerMinutes = prayer.totalMinutes;
            nextPrayer = prayer.name;
            nextPrayerTime = { hours: prayer.hours, minutes: prayer.minutes };
        }
    }

    // If no current prayer found (before Fajr), current is Isha from yesterday
    if (!currentPrayer && prayerList.length > 0) {
        const isha = prayerList.find(p => p.name === 'Isha');
        if (isha) {
            currentPrayer = isha;
            currentPrayerTime = convertTo12Hour(`${String(isha.hours).padStart(2, '0')}:${String(isha.minutes).padStart(2, '0')}`);
        }
    }

    // If no next prayer found today, first prayer is tomorrow's Fajr
    if (!nextPrayer) {
        nextPrayer = 'Fajr';
        const fajrTime = prayerState.timings.Fajr.split(' ')[0].split(':').map(Number);
        nextPrayerTime = { hours: fajrTime[0], minutes: fajrTime[1] };
    }

    prayerState.currentPrayer = currentPrayer;
    prayerState.nextPrayer = { name: nextPrayer, time: nextPrayerTime };

    // Update current prayer display
    const currentPrayerNameEl = document.getElementById('current-prayer-name');
    const currentPrayerTimeEl = document.getElementById('current-prayer-time');
    if (currentPrayerNameEl && currentPrayer) {
        currentPrayerNameEl.textContent = currentPrayer.name;
    }
    if (currentPrayerTimeEl && currentPrayerTime) {
        currentPrayerTimeEl.textContent = currentPrayerTime;
    }

    // Update next prayer display
    const nextPrayerNameEl = document.getElementById('next-prayer-name');
    if (nextPrayerNameEl) {
        nextPrayerNameEl.textContent = nextPrayer;
    }

    // Highlight prayer cards in grid
    highlightPrayerCards(currentTime);

    // Start countdown
    startPrayerCountdown();
}

// Highlight active and passed prayer cards
function highlightPrayerCards(currentMinutes) {
    const timings = prayerState.timings;
    if (!timings) return;

    PRAYER_IDS.forEach((id, index) => {
        const card = document.getElementById(`${id}-card`);
        if (!card) return;

        const prayerName = PRAYER_NAMES[index];
        const timeStr = timings[prayerName];
        if (!timeStr) return;

        const [hours, minutes] = timeStr.split(' ')[0].split(':').map(Number);
        const prayerMinutes = hours * 60 + minutes;

        // Remove existing classes
        card.classList.remove('active', 'passed', 'current');

        if (prayerState.nextPrayer && prayerName === prayerState.nextPrayer.name) {
            card.classList.add('active');
        } else if (prayerState.currentPrayer && prayerName === prayerState.currentPrayer.name) {
            card.classList.add('current');
        } else if (prayerMinutes < currentMinutes) {
            card.classList.add('passed');
        }
    });
}

// Start countdown timer
function startPrayerCountdown() {
    // Clear existing interval
    if (prayerState.countdownInterval) {
        clearInterval(prayerState.countdownInterval);
    }

    const updateCountdown = () => {
        if (!prayerState.nextPrayer) return;

        const now = new Date();
        const { hours, minutes } = prayerState.nextPrayer.time;

        // Create target time for today
        let target = new Date();
        target.setHours(hours, minutes, 0, 0);

        // Check if we've passed the prayer time (within the same minute)
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = hours * 60 + minutes;

        // If the prayer time has arrived or passed, recalculate immediately
        if (nowMinutes >= targetMinutes && prayerState.nextPrayer.name !== 'Fajr') {
            // Prayer time reached, recalculate
            calculateNextPrayer();
            return;
        }

        // For Fajr (next day), check if target is in the past
        if (target <= now && prayerState.nextPrayer.name === 'Fajr') {
            target.setDate(target.getDate() + 1);
        }

        const diff = target - now;

        if (diff <= 0) {
            // Prayer time reached, recalculate
            calculateNextPrayer();
            return;
        }

        const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secondsLeft = Math.floor((diff % (1000 * 60)) / 1000);

        const countdownEl = document.getElementById('next-prayer-countdown');
        if (countdownEl) {
            if (hoursLeft > 0) {
                countdownEl.textContent = `${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`;
            } else {
                countdownEl.textContent = `${minutesLeft}m ${secondsLeft}s`;
            }
        }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    prayerState.countdownInterval = setInterval(updateCountdown, 1000);
}

// Toggle expanded view
function togglePrayerExpanded() {
    const expandedView = document.getElementById('prayer-expanded-view');
    const expandIcon = document.getElementById('prayer-expand-icon');

    if (expandedView && expandIcon) {
        expandedView.classList.toggle('hidden');
        expandIcon.classList.toggle('rotated');
    }
}

// UI State functions
function showLocationRequest() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.remove('hidden');
    loading?.classList.add('hidden');
    display?.classList.add('hidden');
}

function showPrayerLoading() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.add('hidden');
    loading?.classList.remove('hidden');
    display?.classList.add('hidden');
}

function hidePrayerLoading() {
    const loading = document.getElementById('prayer-loading');
    loading?.classList.add('hidden');
}

function showPrayerTimesDisplay() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.add('hidden');
    loading?.classList.add('hidden');
    display?.classList.remove('hidden');
}

// Initialize prayer times on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPrayerTimes, 100);

    // Add expand/collapse click handler
    const compactCard = document.getElementById('prayer-compact-card');
    if (compactCard) {
        compactCard.addEventListener('click', togglePrayerExpanded);
    }
});

// ============================================
// LAST READ TRACKING
// ============================================

const lastReadState = {
    surahNumber: null,
    surahName: null,
    surahEnglishName: null,
    ayahNumber: null,
    totalAyahs: null
};

// Initialize Last Read feature
function initLastRead() {
    // Load saved reading position
    loadLastReadPosition();

    // Update display
    updateLastReadDisplay();

    // Set up event listeners
    const continueBtn = document.getElementById('continue-reading-btn');
    const lastReadCard = document.getElementById('last-read-card');
    const playLastReadBtn = document.getElementById('play-last-read');

    if (continueBtn) {
        continueBtn.addEventListener('click', continueReading);
    }

    if (lastReadCard) {
        lastReadCard.addEventListener('click', continueReading);
    }

    if (playLastReadBtn) {
        playLastReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playLastReadAudio();
        });
    }
}

// Save reading position when user views an ayah
function saveReadingPosition(surahNumber, surahName, surahEnglishName, ayahNumber, totalAyahs) {
    lastReadState.surahNumber = surahNumber;
    lastReadState.surahName = surahName;
    lastReadState.surahEnglishName = surahEnglishName;
    lastReadState.ayahNumber = ayahNumber;
    lastReadState.totalAyahs = totalAyahs;

    localStorage.setItem('lastRead', JSON.stringify({
        surahNumber,
        surahName,
        surahEnglishName,
        ayahNumber,
        totalAyahs,
        timestamp: Date.now()
    }));

    updateLastReadDisplay();
}

// Load saved reading position
function loadLastReadPosition() {
    try {
        const saved = localStorage.getItem('lastRead');
        if (saved) {
            const data = JSON.parse(saved);
            lastReadState.surahNumber = data.surahNumber;
            lastReadState.surahName = data.surahName;
            lastReadState.surahEnglishName = data.surahEnglishName;
            lastReadState.ayahNumber = data.ayahNumber;
            lastReadState.totalAyahs = data.totalAyahs;
            return true;
        }
    } catch (e) {
        console.warn('Could not load last read position:', e);
    }
    return false;
}

// Update the Last Read display
function updateLastReadDisplay() {
    const surahEl = document.getElementById('last-read-surah');
    const ayahEl = document.getElementById('last-read-ayah');
    const percentEl = document.getElementById('last-read-percent');
    const progressFill = document.getElementById('last-read-progress-fill');

    if (lastReadState.surahNumber && lastReadState.ayahNumber) {
        const surahName = lastReadState.surahEnglishName || lastReadState.surahName || `Surah ${lastReadState.surahNumber}`;

        if (surahEl) {
            surahEl.textContent = `Surah ${surahName}`;
        }
        if (ayahEl) {
            ayahEl.textContent = `Ayah ${lastReadState.ayahNumber}`;
        }

        // Calculate progress
        if (lastReadState.totalAyahs && lastReadState.ayahNumber) {
            const progress = Math.round((lastReadState.ayahNumber / lastReadState.totalAyahs) * 100);
            if (percentEl) {
                percentEl.textContent = `${progress}%`;
            }
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
        }
    } else {
        // No reading history
        if (surahEl) surahEl.textContent = 'No Reading History';
        if (ayahEl) ayahEl.textContent = 'Start Reading';
        if (percentEl) percentEl.textContent = '0%';
        if (progressFill) progressFill.style.width = '0%';
    }
}

// Continue reading from last position
async function continueReading() {
    if (lastReadState.surahNumber) {
        // Switch to read tab
        switchTab('read');

        // Set flag to prevent position updates during scroll
        isScrollingToSavedPosition = true;

        // Load the surah
        await loadSurah(lastReadState.surahNumber);

        // Wait for DOM update then scroll to ayah - use longer timeout and retry
        const scrollWithRetry = (attempts = 0) => {
            const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${lastReadState.ayahNumber}"]`);
            if (ayahCard) {
                ayahCard.scrollIntoView({ behavior: 'instant', block: 'center' });
                ayahCard.classList.add('highlight');
                setTimeout(() => {
                    ayahCard.classList.remove('highlight');
                    // Re-enable position tracking after scroll completes
                    isScrollingToSavedPosition = false;
                }, 2000);
            } else if (attempts < 5) {
                // Retry after 200ms if ayah card not found
                setTimeout(() => scrollWithRetry(attempts + 1), 200);
            } else {
                // Give up, re-enable tracking
                isScrollingToSavedPosition = false;
            }
        };

        // Start scrolling after initial delay
        setTimeout(() => scrollWithRetry(), 500);
    } else {
        // No reading history, just switch to read tab
        switchTab('read');
    }
}

// Scroll to a specific ayah
function scrollToAyah(ayahNumber) {
    const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${ayahNumber}"]`);
    if (ayahCard) {
        ayahCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ayahCard.classList.add('highlight');
        setTimeout(() => {
            ayahCard.classList.remove('highlight');
        }, 2000);
    }
}

// Play audio from last read position
async function playLastReadAudio() {
    if (lastReadState.surahNumber && lastReadState.ayahNumber) {
        // Play the surah starting from the last read ayah
        const reciter = state.selectedAudioEdition || 'ar.alafasy';

        // This would start playing from the specific ayah
        // For now, we just switch to the Listen tab and play the surah
        switchTab('listen');

        // Select the surah in the dropdown
        if (elements.audioSurahSelect) {
            elements.audioSurahSelect.value = lastReadState.surahNumber;
            await onAudioSurahChange();

            // Try to skip to the correct ayah
            if (audioState.playlist.length > 0 && lastReadState.ayahNumber > 1) {
                audioState.currentIndex = Math.min(lastReadState.ayahNumber - 1, audioState.playlist.length - 1);
                playCurrentAyah();
            }
        }
    }
}

// Hook into surah loading to track reading
const originalRenderSurah = renderSurah;
renderSurah = function () {
    originalRenderSurah();

    // Save position when surah is loaded
    if (state.currentSurah && state.currentSurah.arabic) {
        const arabic = state.currentSurah.arabic;

        // Only reset to ayah 1 if this is a different surah than the saved one
        // This preserves the position when continuing reading
        // Use parseInt to ensure proper comparison (avoid string/number mismatch)
        const savedAyah = (parseInt(lastReadState.surahNumber) === parseInt(arabic.number))
            ? (lastReadState.ayahNumber || 1)
            : 1;

        saveReadingPosition(
            arabic.number,
            arabic.name,
            arabic.englishName,
            savedAyah,
            arabic.numberOfAyahs
        );

        // Set up ayah visibility tracking
        setupAyahTracking();
    }
};

// Flag to prevent position updates during programmatic scrolling
let isScrollingToSavedPosition = false;
let ayahTrackingDebounce = null;
let currentFocusedAyah = null;
let focusUpdateDebounce = null;

// Find the ayah closest to reading position (upper third of viewport)
function updateFocusedAyah() {
    const ayahCards = document.querySelectorAll('.ayah-card');
    // Focus point at 35% from top - where eyes naturally rest when reading
    const focusPoint = window.innerHeight * 0.35;

    let closestCard = null;
    let closestDistance = Infinity;

    ayahCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const distance = Math.abs(cardCenter - focusPoint);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
        }
    });

    if (closestCard) {
        const ayahNumber = parseInt(closestCard.dataset.ayahNumber);

        if (currentFocusedAyah !== ayahNumber) {
            // Remove focused class from all
            document.querySelectorAll('.ayah-card.focused').forEach(card => {
                card.classList.remove('focused');
            });
            // Add focused class to closest
            closestCard.classList.add('focused');
            currentFocusedAyah = ayahNumber;

            // Save position (debounced)
            if (!isScrollingToSavedPosition && state.currentSurah?.arabic) {
                clearTimeout(ayahTrackingDebounce);
                ayahTrackingDebounce = setTimeout(() => {
                    const arabic = state.currentSurah.arabic;
                    saveReadingPosition(
                        arabic.number,
                        arabic.name,
                        arabic.englishName,
                        ayahNumber,
                        arabic.numberOfAyahs
                    );
                }, 500);
            }
        }
    }
}

// Track which ayah user is viewing
function setupAyahTracking() {
    // Use scroll event with minimal debounce for fast focus tracking
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(updateFocusedAyah, 16);
    }, { passive: true });

    // Initial focus update
    setTimeout(updateFocusedAyah, 100);
}

// Initialize Last Read on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initLastRead, 200);
});

// ============================================
// QIBLA FINDER
// ============================================

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

const qiblaState = {
    userLat: null,
    userLng: null,
    qiblaAngle: null,
    deviceHeading: null,
    orientationHandler: null
};

// Initialize Qibla Finder
function initQiblaFinder() {
    const openBtn = document.getElementById('open-qibla-btn');
    const closeBtn = document.getElementById('qibla-close');
    const calibrateBtn = document.getElementById('qibla-calibrate');

    if (openBtn) {
        openBtn.addEventListener('click', openQiblaModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeQiblaModal);
    }
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', calibrateQibla);
    }
}

// Open Qibla Modal
function openQiblaModal() {
    const modal = document.getElementById('qibla-modal');
    if (modal) {
        // Track qibla finder usage
        trackEvent('qibla-finder-opened');

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Get user location and calculate Qibla
        getUserLocationForQibla();
    }
}

// Close Qibla Modal
function closeQiblaModal() {
    const modal = document.getElementById('qibla-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';

        // Stop listening to device orientation
        if (qiblaState.orientationHandler) {
            window.removeEventListener('deviceorientationabsolute', qiblaState.orientationHandler);
            window.removeEventListener('deviceorientation', qiblaState.orientationHandler);
            qiblaState.orientationHandler = null;
        }
    }
}

// Get user location for Qibla
function getUserLocationForQibla() {
    // Try to use saved location first
    const savedLat = localStorage.getItem('prayerLat');
    const savedLng = localStorage.getItem('prayerLng');

    if (savedLat && savedLng) {
        qiblaState.userLat = parseFloat(savedLat);
        qiblaState.userLng = parseFloat(savedLng);
        calculateAndDisplayQibla();
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                qiblaState.userLat = position.coords.latitude;
                qiblaState.userLng = position.coords.longitude;
                calculateAndDisplayQibla();
            },
            (error) => {
                console.error('Geolocation error:', error);
                // Use a default location (New York)
                qiblaState.userLat = 40.7128;
                qiblaState.userLng = -74.0060;
                calculateAndDisplayQibla();
            }
        );
    }
}

// Calculate Qibla direction and distance
function calculateAndDisplayQibla() {
    if (!qiblaState.userLat || !qiblaState.userLng) return;

    // Calculate Qibla angle
    qiblaState.qiblaAngle = calculateQiblaAngle(
        qiblaState.userLat,
        qiblaState.userLng,
        KAABA_LAT,
        KAABA_LNG
    );

    // Calculate distance to Kaaba
    const distance = calculateDistance(
        qiblaState.userLat,
        qiblaState.userLng,
        KAABA_LAT,
        KAABA_LNG
    );

    // Update UI elements
    const distanceEl = document.getElementById('qibla-distance');
    const latEl = document.getElementById('qibla-latitude');
    const lngEl = document.getElementById('qibla-longitude');
    const pointer = document.getElementById('qibla-pointer');
    const locationNameEl = document.getElementById('qibla-location-name');
    const bearingEl = document.getElementById('qibla-bearing');

    if (distanceEl) {
        distanceEl.textContent = Math.round(distance).toLocaleString();
    }
    if (latEl) {
        const latDir = qiblaState.userLat >= 0 ? 'N' : 'S';
        latEl.textContent = `${Math.abs(qiblaState.userLat).toFixed(2)}° ${latDir}`;
    }
    if (lngEl) {
        const lngDir = qiblaState.userLng >= 0 ? 'E' : 'W';
        lngEl.textContent = `${Math.abs(qiblaState.userLng).toFixed(2)}° ${lngDir}`;
    }

    // Update location name from prayer times storage
    if (locationNameEl) {
        const savedCity = localStorage.getItem('prayerCity');
        const savedCountry = localStorage.getItem('prayerCountry');
        if (savedCity && savedCountry) {
            locationNameEl.textContent = `${savedCity}, ${savedCountry}`;
        } else if (savedCity) {
            locationNameEl.textContent = savedCity;
        } else {
            locationNameEl.textContent = 'Location found';
        }
    }

    // Update bearing angle
    if (bearingEl) {
        bearingEl.textContent = `${Math.round(qiblaState.qiblaAngle)}°`;
    }

    // Set initial pointer rotation
    if (pointer) {
        pointer.style.transform = `rotate(${qiblaState.qiblaAngle}deg)`;
    }

    // Start listening to device orientation
    startCompass();
}

// Calculate angle from user to Kaaba
function calculateQiblaAngle(lat1, lng1, lat2, lng2) {
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const lngDiff = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(lngDiff) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lngDiff);

    let angle = Math.atan2(y, x) * 180 / Math.PI;
    return (angle + 360) % 360;
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const latDiff = (lat2 - lat1) * Math.PI / 180;
    const lngDiff = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Start compass functionality
function startCompass() {
    // Check if device orientation is available
    if (window.DeviceOrientationEvent) {
        // Request permission for iOS 13+
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        addOrientationListener();
                    }
                })
                .catch(console.error);
        } else {
            addOrientationListener();
        }
    }
}

// Add device orientation listener
function addOrientationListener() {
    qiblaState.orientationHandler = (event) => {
        let heading = null;

        // Get compass heading
        if (event.webkitCompassHeading !== undefined) {
            // iOS
            heading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            // Android/Other
            heading = 360 - event.alpha;
        }

        if (heading !== null) {
            qiblaState.deviceHeading = heading;
            updateCompassPointer();
        }
    };

    // Try absolute orientation first, fall back to regular
    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', qiblaState.orientationHandler);
    } else {
        window.addEventListener('deviceorientation', qiblaState.orientationHandler);
    }
}

// Update compass pointer based on device heading
function updateCompassPointer() {
    const pointer = document.getElementById('qibla-pointer');
    if (pointer && qiblaState.qiblaAngle !== null && qiblaState.deviceHeading !== null) {
        const rotation = qiblaState.qiblaAngle - qiblaState.deviceHeading;
        pointer.style.transform = `rotate(${rotation}deg)`;
    }
}

// Calibrate compass
function calibrateQibla() {
    // Re-get location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                qiblaState.userLat = position.coords.latitude;
                qiblaState.userLng = position.coords.longitude;

                // Save to localStorage
                localStorage.setItem('prayerLat', position.coords.latitude.toString());
                localStorage.setItem('prayerLng', position.coords.longitude.toString());

                calculateAndDisplayQibla();
            },
            (error) => {
                console.error('Calibration error:', error);
            },
            { enableHighAccuracy: true }
        );
    }
}

// Initialize Qibla on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initQiblaFinder, 300);
});

// ============================================
// RECITER SELECTOR MODAL
// ============================================

// Open reciter modal
function openReciterModal() {
    const modal = document.getElementById('reciter-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadRecitersInModal();
    }
}

// Close reciter modal
function closeReciterModal() {
    const modal = document.getElementById('reciter-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Load reciters into modal
function loadRecitersInModal() {
    const reciterList = document.getElementById('reciter-list');
    if (!reciterList) return;

    // Use audioEditions which is populated from the audio editions API
    const audioEditions = state.audioEditions || [];

    if (audioEditions.length === 0) {
        reciterList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">Loading reciters...</p>';
        // Try to fetch if not loaded
        fetchAudioEditions().then(() => {
            if (state.audioEditions.length > 0) {
                loadRecitersInModal();
            }
        });
        return;
    }

    const currentReciter = state.selectedAudioEdition || 'ar.alafasy';

    reciterList.innerHTML = audioEditions.map(edition => {
        const isSelected = edition.identifier === currentReciter;
        return `
            <button class="reciter-item ${isSelected ? 'selected' : ''}" data-reciter="${edition.identifier}">
                <div class="reciter-item-icon">
                    <span class="material-symbols-outlined">${isSelected ? 'check' : 'mic'}</span>
                </div>
                <div class="reciter-item-info">
                    <p class="reciter-item-name">${edition.englishName}</p>
                    <p class="reciter-item-style">${edition.language || 'Arabic'}</p>
                </div>
                <span class="material-symbols-outlined reciter-item-check">check_circle</span>
            </button>
        `;
    }).join('');

    // Add click handlers
    reciterList.querySelectorAll('.reciter-item').forEach(item => {
        item.addEventListener('click', () => {
            const reciterId = item.dataset.reciter;
            selectReciter(reciterId);
        });
    });
}

// Select a reciter
function selectReciter(reciterId) {
    const edition = state.audioEditions.find(ed => ed.identifier === reciterId);
    if (edition) {
        // Update state
        state.selectedAudioEdition = reciterId;
        localStorage.setItem('selectedAudioEdition', reciterId);

        // Update Listen tab's reciter select
        const reciterSelect = document.getElementById('reciter-select');
        if (reciterSelect) {
            reciterSelect.value = reciterId;
        }

        // Update full player reciter display
        const reciterNameEl = document.getElementById('full-player-reciter');
        if (reciterNameEl) {
            reciterNameEl.textContent = edition.englishName;
        }

        // Update global player state
        globalPlayerState.reciter = edition.englishName;

        // Update mini player display
        updateMiniPlayerDisplay();

        // Close modal first
        closeReciterModal();

        // If audio is currently playing OR paused (but mini player visible), reload with new reciter
        const listenAudio = elements.audioPlayer;
        const readAudio = document.getElementById('read-audio-player');

        // Check Listen tab audio
        if (globalPlayerState.source === 'listen' && listenAudio) {
            const surahSelect = document.getElementById('audio-surah-select');
            const currentSurah = surahSelect?.value;
            if (currentSurah && audioState.playlist.length > 0) {
                const wasPlaying = !listenAudio.paused;
                const currentAyahIndex = audioState.currentIndex || 0;
                const currentTime = listenAudio.currentTime || 0;

                // Reload with new reciter
                playAudio(currentSurah, reciterId).then(() => {
                    // Continue from same ayah
                    if (currentAyahIndex < audioState.playlist.length) {
                        audioState.currentIndex = currentAyahIndex;
                        listenAudio.src = audioState.playlist[currentAyahIndex];
                        listenAudio.load();

                        listenAudio.addEventListener('loadedmetadata', function onLoad() {
                            // Try to restore the time position
                            if (currentTime > 0 && currentTime < listenAudio.duration) {
                                listenAudio.currentTime = currentTime;
                            }
                            if (wasPlaying) {
                                listenAudio.play();
                            }
                            listenAudio.removeEventListener('loadedmetadata', onLoad);
                        });

                        updateAyahCounter();
                    }
                });
            }
        }
        // Check Read tab audio
        else if (globalPlayerState.source === 'read' && readAudio) {
            const surahNumber = readAudioState.surahNumber;
            if (surahNumber && readAudioState.playlist.length > 0) {
                const wasPlaying = !readAudio.paused;
                const currentAyahIndex = readAudioState.currentIndex || 0;
                const currentTime = readAudio.currentTime || 0;

                // Fetch new audio URLs from API
                fetchAPI(`/surah/${surahNumber}/${reciterId}`).then(data => {
                    if (data.ayahs && data.ayahs.length > 0) {
                        // Rebuild playlist with same structure
                        const startOffset = readAudioState.startAyahOffset || 1;

                        // If playing whole surah
                        if (readAudioState.playlist.length > 1 || startOffset === 1) {
                            const newPlaylist = data.ayahs.map(a => a.audio).filter(Boolean);
                            readAudioState.playlist = newPlaylist;
                        } else {
                            // Single ayah mode
                            const ayah = data.ayahs.find(a => a.numberInSurah === startOffset);
                            if (ayah && ayah.audio) {
                                readAudioState.playlist = [ayah.audio];
                            }
                        }

                        // Play current ayah with new reciter
                        if (currentAyahIndex < readAudioState.playlist.length) {
                            readAudio.src = readAudioState.playlist[currentAyahIndex];
                            readAudio.load();

                            readAudio.addEventListener('loadedmetadata', function onLoad() {
                                if (currentTime > 0 && currentTime < readAudio.duration) {
                                    readAudio.currentTime = currentTime;
                                }
                                if (wasPlaying) {
                                    readAudio.play();
                                }
                                readAudio.removeEventListener('loadedmetadata', onLoad);
                            });

                            updateReadPlayerUI();
                        }
                    }
                }).catch(err => {
                    console.error('Error loading new reciter audio:', err);
                });
            }
        }
    }
}

// Initialize reciter modal
function initReciterModal() {
    const closeBtn = document.getElementById('reciter-modal-close');
    const overlay = document.querySelector('.reciter-modal-overlay');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeReciterModal);
    }
    if (overlay) {
        overlay.addEventListener('click', closeReciterModal);
    }
}

// Initialize reciter modal on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initReciterModal, 400);
});

// ============================================
// SWIPE GESTURE NAVIGATION
// ============================================

const swipeState = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    threshold: 80, // Minimum swipe distance
    restraint: 100, // Maximum vertical deviation
    allowedTime: 500, // Maximum time for swipe
    startTime: 0
};

// Tab order for swipe navigation (matches bottom nav order)
const TAB_ORDER = ['home', 'read', 'dua', 'more'];

// Get current active tab
function getCurrentTab() {
    const activeNav = document.querySelector('.nav-link.active');
    return activeNav ? activeNav.dataset.tab : 'home';
}

// Check if we're in an internal view and return the view info
// Returns: { tab: string, level: number, goBack: function } or null
function getInternalViewInfo() {
    const currentTab = getCurrentTab();

    // READ TAB - Surah Detail View
    if (currentTab === 'read') {
        const surahView = document.getElementById('surah-view');
        if (surahView && !surahView.classList.contains('hidden')) {
            return {
                tab: 'read',
                view: 'surah-detail',
                goBack: () => {
                    surahView.classList.add('slide-out-right');
                    setTimeout(() => {
                        surahView.classList.remove('slide-out-right');
                        showSurahList();
                    }, 250);
                }
            };
        }
    }

    // DUA TAB - Check for nested views
    if (currentTab === 'dua') {
        const duaDetailView = document.getElementById('dua-detail-view');
        const duaListView = document.getElementById('dua-list-view');
        const duaCategoriesView = document.getElementById('dua-categories-view');

        // Deepest level: Dua Detail View -> go back to Categories (skip list)
        if (duaDetailView && !duaDetailView.classList.contains('hidden')) {
            return {
                tab: 'dua',
                view: 'dua-detail',
                goBack: () => {
                    duaDetailView.classList.add('slide-out-right');
                    setTimeout(() => {
                        duaDetailView.classList.remove('slide-out-right');
                        showDuaCategories();
                    }, 250);
                }
            };
        }

        // Second level: Dua List View -> go back to Categories
        if (duaListView && !duaListView.classList.contains('hidden')) {
            return {
                tab: 'dua',
                view: 'dua-list',
                goBack: () => {
                    duaListView.classList.add('slide-out-right');
                    setTimeout(() => {
                        duaListView.classList.remove('slide-out-right');
                        showDuaCategories();
                    }, 250);
                }
            };
        }

        // Categories view is root, no back navigation needed
    }

    // MORE TAB - Check for nested feature views
    if (currentTab === 'more') {
        const moreHubView = document.getElementById('more-hub-view');

        // Check for deepest nested views first

        // Hadith Section View (deepest) → go back to Book View
        const hadithSectionView = document.getElementById('hadith-section-view');
        if (hadithSectionView && !hadithSectionView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'hadith-section',
                goBack: () => {
                    hadithSectionView.classList.add('slide-out-right');
                    setTimeout(() => {
                        hadithSectionView.classList.remove('slide-out-right');
                        showFeatureView('hadith-book-view');
                    }, 250);
                }
            };
        }

        // Hadith Book View → go back to Hadith View (books list)
        const hadithBookView = document.getElementById('hadith-book-view');
        if (hadithBookView && !hadithBookView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'hadith-book',
                goBack: () => {
                    hadithBookView.classList.add('slide-out-right');
                    setTimeout(() => {
                        hadithBookView.classList.remove('slide-out-right');
                        showFeatureView('hadith-view');
                    }, 250);
                }
            };
        }

        // Name Detail View → go back to Names List
        const nameDetailView = document.getElementById('name-detail-view');
        if (nameDetailView && !nameDetailView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'name-detail',
                goBack: () => {
                    nameDetailView.classList.add('slide-out-right');
                    setTimeout(() => {
                        nameDetailView.classList.remove('slide-out-right');
                        showFeatureView('names-view');
                    }, 250);
                }
            };
        }

        // Any other feature view → go back to More Hub
        if (moreHubView && moreHubView.classList.contains('hidden')) {
            const visibleViews = document.querySelectorAll('#more-tab .feature-view:not(.hidden)');
            if (visibleViews.length > 0) {
                const activeView = visibleViews[0];
                return {
                    tab: 'more',
                    view: 'feature',
                    goBack: () => {
                        activeView.classList.add('slide-out-right');
                        setTimeout(() => {
                            activeView.classList.remove('slide-out-right');
                            showMoreHub();
                        }, 250);
                    }
                };
            }
        }
    }

    // No internal view detected - we're at root level
    return null;
}

// Initialize swipe gestures
function initSwipeNavigation() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
    mainContent.addEventListener('touchmove', handleTouchMove, { passive: true });
    mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    mainContent.addEventListener('touchcancel', handleTouchCancel, { passive: true });
}

// Handle touch start
function handleTouchStart(e) {
    const touch = e.changedTouches[0];
    swipeState.startX = touch.pageX;
    swipeState.startY = touch.pageY;
    swipeState.startTime = Date.now();
}

// Handle touch move - show indicator while swiping
function handleTouchMove(e) {
    const touch = e.changedTouches[0];
    const distX = touch.pageX - swipeState.startX;
    const distY = touch.pageY - swipeState.startY;

    // Only show indicator for horizontal swipes
    if (Math.abs(distX) > 30 && Math.abs(distY) < Math.abs(distX)) {
        // Check for open modals
        const qiblaModal = document.getElementById('qibla-modal');
        const fullPlayerModal = document.getElementById('full-player-modal');
        const reciterModal = document.getElementById('reciter-modal');

        if (qiblaModal && !qiblaModal.classList.contains('hidden')) return;
        if (fullPlayerModal && !fullPlayerModal.classList.contains('hidden')) return;
        if (reciterModal && !reciterModal.classList.contains('hidden')) return;

        const internalViewInfo = getInternalViewInfo();
        const currentTab = getCurrentTab();
        const currentIndex = TAB_ORDER.indexOf(currentTab);

        // Calculate intensity based on swipe progress (0 to 1)
        const intensity = Math.min(Math.abs(distX) / swipeState.threshold, 1);

        if (distX > 0) {
            // Swiping right
            if (internalViewInfo) {
                showSwipeIndicatorLive('left', 'Back', intensity);
            } else if (currentIndex > 0) {
                const prevTab = TAB_ORDER[currentIndex - 1];
                showSwipeIndicatorLive('left', prevTab.charAt(0).toUpperCase() + prevTab.slice(1), intensity);
            }
        } else {
            // Swiping left
            if (!internalViewInfo && currentIndex < TAB_ORDER.length - 1) {
                const nextTab = TAB_ORDER[currentIndex + 1];
                showSwipeIndicatorLive('right', nextTab.charAt(0).toUpperCase() + nextTab.slice(1), intensity);
            }
        }
    }
}

// Handle touch cancel
function handleTouchCancel() {
    hideSwipeIndicator();
}

// Handle touch end
function handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    swipeState.endX = touch.pageX;
    swipeState.endY = touch.pageY;

    // Hide indicator after a brief delay
    setTimeout(() => hideSwipeIndicator(), 150);

    handleSwipe();
}

// Process swipe gesture
function handleSwipe() {
    const elapsedTime = Date.now() - swipeState.startTime;
    const distX = swipeState.endX - swipeState.startX;
    const distY = swipeState.endY - swipeState.startY;

    // Check if it's a valid horizontal swipe
    if (elapsedTime <= swipeState.allowedTime) {
        if (Math.abs(distX) >= swipeState.threshold && Math.abs(distY) <= swipeState.restraint) {
            // Check for open modals that should block swipe
            const qiblaModal = document.getElementById('qibla-modal');
            const fullPlayerModal = document.getElementById('full-player-modal');
            const reciterModal = document.getElementById('reciter-modal');

            if (qiblaModal && !qiblaModal.classList.contains('hidden')) return;
            if (fullPlayerModal && !fullPlayerModal.classList.contains('hidden')) return;
            if (reciterModal && !reciterModal.classList.contains('hidden')) return;

            // Check if in internal view
            const internalViewInfo = getInternalViewInfo();

            if (internalViewInfo) {
                // In internal view: swipe right goes BACK (not change tabs)
                if (distX > 0) {
                    showSwipeIndicator('left', 'Back');
                    setTimeout(() => hideSwipeIndicator(), 300);
                    internalViewInfo.goBack();
                }
                // Left swipe does nothing in internal views
                return;
            }

            // At root level: swipe changes tabs
            const currentTab = getCurrentTab();
            const currentIndex = TAB_ORDER.indexOf(currentTab);

            if (distX > 0) {
                // Swiped right - go to previous tab
                if (currentIndex > 0) {
                    const prevTab = TAB_ORDER[currentIndex - 1];
                    showSwipeIndicator('left', prevTab.charAt(0).toUpperCase() + prevTab.slice(1));
                    setTimeout(() => hideSwipeIndicator(), 300);
                    switchTab(prevTab);
                }
            } else {
                // Swiped left - go to next tab
                if (currentIndex < TAB_ORDER.length - 1) {
                    const nextTab = TAB_ORDER[currentIndex + 1];
                    showSwipeIndicator('right', nextTab.charAt(0).toUpperCase() + nextTab.slice(1));
                    setTimeout(() => hideSwipeIndicator(), 300);
                    switchTab(nextTab);
                }
            }
        }
    }
}

// Show swipe indicator (for completion)
function showSwipeIndicator(direction, label) {
    showSwipeIndicatorLive(direction, label, 1);
}

// Show swipe indicator with intensity (0-1) - used during live swiping
function showSwipeIndicatorLive(direction, label, intensity) {
    const indicator = document.getElementById('swipe-indicator');
    if (!indicator) return;

    const iconEl = indicator.querySelector('.swipe-indicator-icon');
    const labelEl = indicator.querySelector('.swipe-indicator-label');

    // Set direction and content
    indicator.classList.remove('left', 'right', 'hidden');
    indicator.classList.add(direction === 'right' ? 'right' : 'left');

    if (iconEl) {
        iconEl.textContent = direction === 'right' ? 'arrow_forward' : 'arrow_back';
    }
    if (labelEl) {
        labelEl.textContent = label;
    }

    // Apply intensity (opacity and scale)
    indicator.style.opacity = intensity;
    indicator.style.setProperty('--glow-intensity', intensity);

    // Show
    indicator.classList.add('visible');
}

// Hide swipe indicator
function hideSwipeIndicator() {
    const indicator = document.getElementById('swipe-indicator');
    if (!indicator) return;

    indicator.classList.remove('visible');
    indicator.classList.add('hidden');
    indicator.style.opacity = '';
}

// Initialize swipe on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSwipeNavigation, 500);
});

// ============================================
// BOOKMARK SYSTEM
// ============================================

// Bookmark state
const bookmarkState = {
    quran: [],
    hadith: [],
    duas: []
};

// Load bookmarks from localStorage
function loadBookmarks() {
    try {
        const saved = localStorage.getItem('bookmarks');
        if (saved) {
            const parsed = JSON.parse(saved);
            bookmarkState.quran = parsed.quran || [];
            bookmarkState.hadith = parsed.hadith || [];
            bookmarkState.duas = parsed.duas || [];
        }
    } catch (e) {
        console.error('Error loading bookmarks:', e);
    }
}

// Save bookmarks to localStorage
function saveBookmarks() {
    try {
        localStorage.setItem('bookmarks', JSON.stringify(bookmarkState));
    } catch (e) {
        console.error('Error saving bookmarks:', e);
    }
}

// Open bookmark modal
function openBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderBookmarks('quran');
        document.body.style.overflow = 'hidden';
    }
}

// Close bookmark modal
function closeBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Switch bookmark tab
function switchBookmarkTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.bookmark-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bookmarkTab === tab);
    });

    // Update content lists
    document.querySelectorAll('.bookmark-list').forEach(list => {
        list.classList.toggle('active', list.id === `bookmark-${tab}`);
    });

    // Render bookmarks for this tab
    renderBookmarks(tab);
}

// Render bookmarks for a category
function renderBookmarks(category) {
    const container = document.getElementById(`bookmark-${category}-items`);
    const emptyState = document.getElementById(`bookmark-${category}-empty`);

    if (!container) return;

    const bookmarks = bookmarkState[category] || [];

    if (bookmarks.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (category === 'quran') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}" 
                 data-surah="${bookmark.surahNumber}" data-ayah="${bookmark.ayahNumber}"
                 onclick="navigateToBookmark('quran', ${bookmark.surahNumber}, ${bookmark.ayahNumber})">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <div class="bookmark-card-badges">
                            <span class="bookmark-card-badge">Juz ${bookmark.juz || '—'}</span>
                            <span class="bookmark-card-type">${bookmark.revelationType || 'Meccan'}</span>
                        </div>
                        <h3 class="bookmark-card-title">${bookmark.surahName}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.surahEnglishName} • Verse ${bookmark.ayahNumber}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('quran', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                <div class="bookmark-card-arabic">
                    <p>${bookmark.arabicText}</p>
                </div>
                <div class="bookmark-card-translation">
                    <p>"${bookmark.translationText || bookmark.arabicText}"</p>
                </div>
                <div class="bookmark-card-actions">
                    <button class="bookmark-play-btn" onclick="event.stopPropagation(); playBookmarkAudio(${bookmark.surahNumber}, ${bookmark.ayahNumber})">
                        <span class="material-symbols-outlined">play_arrow</span>
                        <span>Listen</span>
                    </button>
                    <div class="bookmark-action-btns">
                        <button class="bookmark-action-btn" onclick="event.stopPropagation(); shareBookmark('quran', '${bookmark.id}')">
                            <span class="material-symbols-outlined">share</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } else if (category === 'hadith') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}"
                 onclick="navigateToBookmark('hadith', '${bookmark.id}')">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <h3 class="bookmark-card-title">${bookmark.collection || 'Hadith'}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.book || ''} • #${bookmark.number || ''}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('hadith', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                <div class="bookmark-card-translation">
                    <p>"${bookmark.text}"</p>
                </div>
            </div>
        `).join('');
    } else if (category === 'duas') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}"
                 onclick="navigateToBookmark('duas', '${bookmark.id}')">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <h3 class="bookmark-card-title">${bookmark.title}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.category || ''}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('duas', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                ${bookmark.arabic ? `
                <div class="bookmark-card-arabic">
                    <p>${bookmark.arabic}</p>
                </div>
                ` : ''}
                <div class="bookmark-card-translation">
                    <p>"${bookmark.translation || bookmark.arabic}"</p>
                </div>
            </div>
        `).join('');
    }
}

// Add a bookmark
function addBookmark(category, data) {
    if (!bookmarkState[category]) return false;

    // Check if already bookmarked
    const exists = bookmarkState[category].some(b => b.id === data.id);
    if (exists) return false;

    // Add with timestamp
    data.timestamp = Date.now();
    bookmarkState[category].push(data);
    saveBookmarks();

    return true;
}

// Remove a bookmark
function removeBookmark(category, id) {
    if (!bookmarkState[category]) return;

    bookmarkState[category] = bookmarkState[category].filter(b => b.id !== id);
    saveBookmarks();
    renderBookmarks(category);
}

// Check if item is bookmarked
function isBookmarked(category, id) {
    if (!bookmarkState[category]) return false;
    return bookmarkState[category].some(b => b.id === id);
}

// Toggle bookmark
function toggleBookmark(category, data) {
    if (isBookmarked(category, data.id)) {
        removeBookmark(category, data.id);
        return false;
    } else {
        addBookmark(category, data);
        return true;
    }
}

// Play audio for bookmarked ayah
function playBookmarkAudio(surahNumber, ayahNumber) {
    closeBookmarkModal();
    playReadAudio(surahNumber, ayahNumber, false);
}

// Navigate to bookmarked item
async function navigateToBookmark(category, param1, param2) {
    // Close the bookmark modal
    closeBookmarkModal();

    if (category === 'quran') {
        const surahNumber = param1;
        const ayahNumber = param2;

        // Switch to read tab
        switchTab('read');

        // Load the surah and wait for it to complete
        await loadSurah(surahNumber);

        // Wait for the surah to fully render, then scroll to the ayah
        // Using longer timeout to ensure rendering is complete
        setTimeout(() => {
            const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${ayahNumber}"]`);
            if (ayahCard) {
                // Use scrollIntoView for more reliable scrolling
                ayahCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // Highlight the ayah temporarily
                ayahCard.classList.add('highlight');
                setTimeout(() => {
                    ayahCard.classList.remove('highlight');
                }, 3000);
            }
        }, 800);
    } else if (category === 'duas') {
        // param1 is the bookmark id
        const bookmarkId = param1;
        const bookmark = bookmarkState.duas?.find(b => b.id === bookmarkId);

        if (bookmark) {
            // Switch to dua tab
            switchTab('dua');

            // Show the dua detail after tab switch
            setTimeout(() => {
                showDuaDetail(bookmark);
            }, 300);
        }
    } else if (category === 'hadith') {
        // param1 is the bookmark id
        const bookmarkId = param1;
        const bookmark = bookmarkState.hadith?.find(b => b.id === bookmarkId);

        if (bookmark) {
            // Extract bookId from the bookmark id (format: hadith-{bookId}-{number})
            const idParts = bookmarkId.split('-');
            const bookId = idParts.length >= 2 ? idParts[1] : null;
            const hadithNumber = bookmark.number;

            if (bookId) {
                // Switch to more tab
                switchTab('more');

                // Find the book info
                const bookInfo = HADITH_BOOKS.find(b => b.id === bookId);

                if (bookInfo) {
                    setTimeout(async () => {
                        // Show hadith view first
                        showFeatureView('hadith-view');

                        // Load the hadith book
                        await loadHadithBook(bookId, bookInfo.file);

                        // Now we need to find which section contains this hadith
                        const book = moreState.hadithBooks[bookId];
                        if (book && hadithNumber) {
                            const sections = book.metadata?.section_details || {};
                            let targetSection = null;

                            // Find the section containing this hadith number
                            for (const [sectionNum, details] of Object.entries(sections)) {
                                if (details.hadithnumber_first <= hadithNumber &&
                                    hadithNumber <= details.hadithnumber_last) {
                                    targetSection = sectionNum;
                                    break;
                                }
                            }

                            if (targetSection) {
                                // Load the section
                                loadHadithSection(bookId, targetSection);

                                // Wait for section to render, then scroll to specific hadith
                                setTimeout(() => {
                                    const hadithCard = document.querySelector(`.hadith-card .hadith-number`);
                                    // Find the card with matching hadith number
                                    const allCards = document.querySelectorAll('.hadith-card');
                                    for (const card of allCards) {
                                        const numberEl = card.querySelector('.hadith-number');
                                        if (numberEl && numberEl.textContent.includes(`#${hadithNumber}`)) {
                                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            card.style.boxShadow = '0 0 0 2px var(--primary)';
                                            setTimeout(() => {
                                                card.style.boxShadow = '';
                                            }, 3000);
                                            break;
                                        }
                                    }
                                }, 500);
                            }
                        }

                        showSuccess(`Opened ${bookmark.collection || 'Hadith'} #${hadithNumber}`);
                    }, 300);
                } else {
                    showError('Hadith collection not found');
                }
            }
        }
    }
}

// Share bookmark
function shareBookmark(category, id) {
    const bookmark = bookmarkState[category]?.find(b => b.id === id);
    if (!bookmark) return;

    let shareText = '';
    if (category === 'quran') {
        shareText = `${bookmark.arabicText}\n\n"${bookmark.translationText || ''}"\n\n— ${bookmark.surahName} (${bookmark.surahEnglishName}), Verse ${bookmark.ayahNumber}`;
    } else if (category === 'hadith') {
        shareText = `"${bookmark.text}"\n\n— ${bookmark.collection}, ${bookmark.book} #${bookmark.number}`;
    } else if (category === 'duas') {
        shareText = `${bookmark.arabic || ''}\n\n"${bookmark.translation || ''}"\n\n— ${bookmark.title}`;
    }

    if (navigator.share) {
        navigator.share({
            title: 'Shared from Fardh App',
            text: shareText
        }).catch(err => console.log('Share cancelled'));
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            showSuccess('Copied to clipboard!');
        }).catch(err => console.error('Copy failed:', err));
    }
}

// Initialize bookmark modal events
document.addEventListener('DOMContentLoaded', () => {
    loadBookmarks();

    // Bookmark button click
    const bookmarkBtn = document.getElementById('bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', openBookmarkModal);
    }

    // Close button
    const closeBtn = document.getElementById('bookmark-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBookmarkModal);
    }

    // Tab switching
    document.querySelectorAll('.bookmark-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchBookmarkTab(tab.dataset.bookmarkTab);
        });
    });

    // Event delegation for ayah bookmark buttons
    document.addEventListener('click', (e) => {
        const bookmarkBtn = e.target.closest('.ayah-bookmark-btn');
        if (bookmarkBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: `quran-${bookmarkBtn.dataset.surahNumber}-${bookmarkBtn.dataset.ayahNumber}`,
                surahNumber: parseInt(bookmarkBtn.dataset.surahNumber),
                surahName: bookmarkBtn.dataset.surahName,
                surahEnglishName: bookmarkBtn.dataset.surahEnglish,
                ayahNumber: parseInt(bookmarkBtn.dataset.ayahNumber),
                arabicText: decodeURIComponent(bookmarkBtn.dataset.arabic || ''),
                translationText: decodeURIComponent(bookmarkBtn.dataset.translation || ''),
                juz: bookmarkBtn.dataset.juz,
                revelationType: bookmarkBtn.dataset.revelation
            };

            const wasBookmarked = bookmarkBtn.classList.contains('bookmarked');
            const isNowBookmarked = toggleBookmark('quran', data);

            // Update button UI
            bookmarkBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = bookmarkBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Ayah bookmarked!' : 'Bookmark removed');
        }

        // Dua bookmark button
        const duaBtn = e.target.closest('.dua-bookmark-btn');
        if (duaBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: duaBtn.dataset.duaId,
                title: decodeURIComponent(duaBtn.dataset.title || ''),
                arabic: decodeURIComponent(duaBtn.dataset.arabic || ''),
                translation: decodeURIComponent(duaBtn.dataset.translation || ''),
                source: decodeURIComponent(duaBtn.dataset.source || ''),
                category: 'Dua'
            };

            const isNowBookmarked = toggleBookmark('duas', data);

            // Update button UI
            duaBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = duaBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Dua bookmarked!' : 'Bookmark removed');
        }

        // Hadith bookmark button
        const hadithBtn = e.target.closest('.hadith-bookmark-btn');
        if (hadithBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: hadithBtn.dataset.hadithId,
                collection: decodeURIComponent(hadithBtn.dataset.collection || ''),
                book: decodeURIComponent(hadithBtn.dataset.book || ''),
                number: hadithBtn.dataset.number,
                text: decodeURIComponent(hadithBtn.dataset.text || '')
            };

            const isNowBookmarked = toggleBookmark('hadith', data);

            // Update button UI
            hadithBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = hadithBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Hadith bookmarked!' : 'Bookmark removed');
        }
    });
});

// ============================================
// DUA OF THE DAY WIDGET
// ============================================

const duaOfDayState = {
    allDuas: [],
    currentDua: null,
    currentIndex: 0
};

// Load all duas for the widget from multiple sources
async function loadDuasForWidget() {
    try {
        // Load from multiple dua sources for variety
        const sources = [
            './islamic_data/dua-dhikr/daily-dua/en.json',
            './islamic_data/dua-dhikr/morning-dhikr/en.json',
            './islamic_data/dua-dhikr/evening-dhikr/en.json',
            './islamic_data/dua-dhikr/selected-dua/en.json'
        ];

        let allDuas = [];

        for (const source of sources) {
            try {
                const response = await fetch(source);
                const data = await response.json();

                // Flatten all items from all categories
                data.forEach(category => {
                    if (category.items && Array.isArray(category.items)) {
                        allDuas = allDuas.concat(category.items);
                    }
                });
            } catch (e) {
                console.warn(`Could not load ${source}:`, e);
            }
        }

        // Filter to duas that have both arabic and translation
        duaOfDayState.allDuas = allDuas.filter(dua =>
            dua.arabic && dua.translation
        );

        // Shuffle the array
        duaOfDayState.allDuas = shuffleArray(duaOfDayState.allDuas);

        // Display first dua
        if (duaOfDayState.allDuas.length > 0) {
            displayDuaOfDay(0);
        }
    } catch (error) {
        console.error('Failed to load duas for widget:', error);
    }
}

// Shuffle array (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Display a dua in the widget
function displayDuaOfDay(index) {
    if (duaOfDayState.allDuas.length === 0) return;

    // Wrap index
    index = index % duaOfDayState.allDuas.length;
    duaOfDayState.currentIndex = index;

    const dua = duaOfDayState.allDuas[index];
    duaOfDayState.currentDua = dua;

    const titleEl = document.getElementById('dua-day-title');
    const arabicEl = document.getElementById('dua-day-arabic');
    const translationEl = document.getElementById('dua-day-translation');
    const sourceEl = document.getElementById('dua-day-source');
    const readMoreEl = document.getElementById('dua-day-read-more');

    // Check if dua is long
    const isLongDua = dua.arabic.length > 80 || dua.translation.length > 120;

    if (titleEl) {
        titleEl.textContent = dua.title || 'Daily Dua';
    }

    if (arabicEl) {
        // Truncate Arabic if too long
        const arabic = dua.arabic.length > 80 ? dua.arabic.substring(0, 80) + '...' : dua.arabic;
        arabicEl.textContent = arabic;
    }

    if (translationEl) {
        // Truncate translation if too long
        const translation = dua.translation.length > 120
            ? '"' + dua.translation.substring(0, 120) + '..."'
            : '"' + dua.translation + '"';
        translationEl.textContent = translation;
    }

    if (sourceEl) {
        sourceEl.textContent = dua.source || 'Hadith';
    }

    // Show/hide read more link for long duas
    if (readMoreEl) {
        if (isLongDua) {
            readMoreEl.classList.remove('hidden');
        } else {
            readMoreEl.classList.add('hidden');
        }
    }
}

// Change to next dua with animation
function changeToNextDua() {
    const content = document.getElementById('dua-day-content');
    if (!content) return;

    // Add swiping animation
    content.classList.add('swiping');

    setTimeout(() => {
        // Change dua
        displayDuaOfDay(duaOfDayState.currentIndex + 1);

        // Remove swiping, add entering animation
        content.classList.remove('swiping');
        content.classList.add('entering');

        setTimeout(() => {
            content.classList.remove('entering');
        }, 300);
    }, 150);
}

// Change to previous dua with animation (swipe down)
function changeToPreviousDua() {
    const content = document.getElementById('dua-day-content');
    if (!content) return;

    // Add swiping animation (in reverse direction)
    content.classList.add('swiping-down');

    setTimeout(() => {
        // Change dua - go back one, wrap around if needed
        let newIndex = duaOfDayState.currentIndex - 1;
        if (newIndex < 0) {
            newIndex = duaOfDayState.allDuas.length - 1;
        }
        displayDuaOfDay(newIndex);

        // Remove swiping, add entering animation
        content.classList.remove('swiping-down');
        content.classList.add('entering-down');

        setTimeout(() => {
            content.classList.remove('entering-down');
        }, 300);
    }, 150);
}

// Navigate to dua detail
function openDuaOfDayDetail() {
    if (!duaOfDayState.currentDua) return;

    // Switch to dua tab
    switchTab('dua');

    // Wait for tab to load, then show dua detail
    setTimeout(() => {
        showDuaDetail(duaOfDayState.currentDua);
    }, 300);
}

// Share current dua
function shareDuaOfDay() {
    if (!duaOfDayState.currentDua) return;

    const dua = duaOfDayState.currentDua;
    const shareText = `${dua.arabic}\n\n"${dua.translation}"\n\n— ${dua.source || dua.title || 'Daily Dua'}`;

    if (navigator.share) {
        navigator.share({
            title: 'Dua of the Day',
            text: shareText
        }).catch(err => console.log('Share cancelled'));
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            showSuccess('Copied to clipboard!');
        }).catch(err => console.error('Copy failed:', err));
    }
}

// Initialize Dua of Day widget
document.addEventListener('DOMContentLoaded', () => {
    loadDuasForWidget();

    const card = document.getElementById('dua-day-card');
    if (card) {
        let touchStartY = 0;
        let touchEndY = 0;

        // Swipe detection
        card.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            touchEndY = e.changedTouches[0].clientY;
            const deltaY = touchStartY - touchEndY;

            // Swipe up detected (> 30px) - next dua
            if (deltaY > 30) {
                changeToNextDua();
            }
            // Swipe down detected (< -30px) - previous dua
            else if (deltaY < -30) {
                changeToPreviousDua();
            }
        }, { passive: true });

        // Click to open detail
        card.addEventListener('click', (e) => {
            // Don't open if user was swiping
            if (Math.abs(touchStartY - touchEndY) < 10) {
                openDuaOfDayDetail();
            }
        });
    }

    // Share button - now opens share modal
    const shareBtn = document.getElementById('share-dua-of-day');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (duaOfDayState.currentDua) {
                openShareModal({
                    type: duaOfDayState.currentDua.title || 'Dua of the Day',
                    arabic: duaOfDayState.currentDua.arabic,
                    translation: duaOfDayState.currentDua.translation,
                    source: duaOfDayState.currentDua.source || 'Hadith'
                });
            }
        });
    }
});

// ============================================
// DAILY NOTIFICATION SYSTEM
// ============================================

// Notification state
const notificationState = {
    enabled: localStorage.getItem('notificationsEnabled') === 'true',
    lastNotificationDate: localStorage.getItem('lastNotificationDate') || null,
    notificationTime: localStorage.getItem('notificationTime') || '09:00'
};

// Calm, encouraging notification templates
const NOTIFICATION_TEMPLATES = {
    continueReading: [
        { title: "📖 Continue Your Journey", body: "Pick up where you left off in your Quran reading" },
        { title: "📚 Your Reading Awaits", body: "A few verses a day keeps the heart at peace" },
        { title: "🌙 Peaceful Moments", body: "Continue your spiritual journey where you left off" },
        { title: "✨ Keep Growing", body: "Every verse brings you closer to understanding" },
        { title: "💚 Gentle Reminder", body: "Your Quran reading is waiting for you" }
    ],
    dailyDua: [
        { title: "🤲 Daily Dua", body: "Start your day with a beautiful supplication" },
        { title: "🌸 Morning Blessings", body: "A moment of dua can brighten your whole day" },
        { title: "💫 Connect Through Dua", body: "Take a moment to speak to your Lord" },
        { title: "🕊️ Peace in Prayer", body: "Discover a beautiful dua today" },
        { title: "🌿 Nurture Your Soul", body: "A short dua for your spiritual wellbeing" }
    ],
    hadith: [
        { title: "✨ Wisdom of the Prophet ﷺ", body: "Discover a beautiful hadith today" },
        { title: "📿 Prophetic Guidance", body: "Learn something new from the Sunnah" },
        { title: "🌟 Daily Hadith", body: "A pearl of wisdom awaits you" },
        { title: "💎 Timeless Teachings", body: "Explore the words of our beloved Prophet ﷺ" },
        { title: "🕌 Sunnah Reminder", body: "Enrich your day with prophetic wisdom" }
    ],
    prayer: [
        { title: "🕌 Moment of Peace", body: "Take a moment to connect with Allah" },
        { title: "🌅 Time for Reflection", body: "Your soul deserves a peaceful pause" },
        { title: "🤍 Inner Tranquility", body: "Find serenity in remembrance of Allah" },
        { title: "💚 Spiritual Refresh", body: "A moment of dhikr for your heart" },
        { title: "🌙 Peaceful Pause", body: "Let your heart find rest in remembrance" }
    ],
    inspiration: [
        { title: "💚 Verse of the Day", body: "A beautiful ayah to reflect upon" },
        { title: "🌟 Quranic Light", body: "Illuminate your day with divine wisdom" },
        { title: "📖 Daily Inspiration", body: "Let the Quran guide your day" },
        { title: "✨ Words of Light", body: "A verse to carry in your heart today" },
        { title: "🌿 Soul Nourishment", body: "Feed your spirit with the Quran" }
    ]
};

// Get random notification from templates
function getRandomNotification() {
    const categories = Object.keys(NOTIFICATION_TEMPLATES);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const templates = NOTIFICATION_TEMPLATES[randomCategory];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

    return {
        ...randomTemplate,
        category: randomCategory
    };
}

// Check if already notified today
function hasNotifiedToday() {
    const lastDate = notificationState.lastNotificationDate;
    if (!lastDate) return false;

    const today = new Date().toDateString();
    const lastNotifDate = new Date(lastDate).toDateString();

    return today === lastNotifDate;
}

// Mark notification as sent today
function markNotificationSent() {
    const now = new Date().toISOString();
    notificationState.lastNotificationDate = now;
    localStorage.setItem('lastNotificationDate', now);
}

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('[Notifications] Not supported in this browser');
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationState.enabled = true;
        localStorage.setItem('notificationsEnabled', 'true');
        return true;
    }

    if (Notification.permission === 'denied') {
        console.log('[Notifications] Permission denied');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            notificationState.enabled = true;
            localStorage.setItem('notificationsEnabled', 'true');
            showSuccess('Daily reminders enabled! 💚');
            return true;
        }
    } catch (error) {
        console.error('[Notifications] Permission request failed:', error);
    }

    return false;
}

// Show a notification
function showDailyNotification() {
    if (!notificationState.enabled) return;
    if (Notification.permission !== 'granted') return;
    if (hasNotifiedToday()) {
        console.log('[Notifications] Already notified today');
        return;
    }

    const notification = getRandomNotification();

    try {
        const notif = new Notification(notification.title, {
            body: notification.body,
            icon: './icons/icon-192x192.png',
            badge: './icons/icon-72x72.png',
            tag: 'fardh-daily',
            renotify: false,
            requireInteraction: false,
            silent: false
        });

        notif.onclick = () => {
            window.focus();
            notif.close();

            // Smart navigation based on notification category
            navigateByCategory(notification.category);
        };

        markNotificationSent();
        console.log('[Notifications] Daily notification sent:', notification.title);

    } catch (error) {
        console.error('[Notifications] Failed to show notification:', error);
    }
}

// Check if it's time to send notification
function checkNotificationTime() {
    if (!notificationState.enabled) return;
    if (hasNotifiedToday()) return;

    const now = new Date();
    const [targetHour, targetMinute] = notificationState.notificationTime.split(':').map(Number);

    // Check if current time is past notification time
    if (now.getHours() > targetHour ||
        (now.getHours() === targetHour && now.getMinutes() >= targetMinute)) {
        showDailyNotification();
    }
}

// Toggle notifications on/off (NOW ALSO SENDS TEST NOTIFICATION)
function toggleNotifications() {
    // First, request permission if not granted
    if (Notification.permission !== 'granted') {
        requestNotificationPermission().then(granted => {
            if (granted) {
                updateNotificationUI();
                // Send test notification immediately
                sendTestNotification();
            }
        });
        return;
    }

    // If permission granted, send test notification immediately
    sendTestNotification();
}

// Send a test notification (for testing purposes)
function sendTestNotification() {
    const notification = getRandomNotification();

    try {
        const notif = new Notification(notification.title, {
            body: notification.body,
            icon: './icons/icon-192x192.png',
            badge: './icons/icon-72x72.png',
            tag: 'fardh-test-' + Date.now(),
            requireInteraction: false,
            data: { category: notification.category }
        });

        notif.onclick = () => {
            window.focus();
            notif.close();

            // Smart navigation based on notification category
            navigateByCategory(notification.category);
        };

        // Mark as enabled
        notificationState.enabled = true;
        localStorage.setItem('notificationsEnabled', 'true');
        updateNotificationUI();

        console.log('[Notifications] Test notification sent:', notification.title, '- Category:', notification.category);

    } catch (error) {
        console.error('[Notifications] Failed to show notification:', error);
        showError('Notification failed. Check browser permissions.');
    }
}

// Navigate to specific content based on notification category
function navigateByCategory(category) {
    switch (category) {
        case 'continueReading':
            // Navigate to last read position
            if (lastReadState.surahNumber) {
                switchTab('read');
                setTimeout(() => {
                    continueReading();
                }, 300);
            } else {
                switchTab('read');
            }
            break;

        case 'dailyDua':
            // Navigate to dua tab and show random dua
            switchTab('dua');
            setTimeout(() => {
                if (duaOfDayState.currentDua) {
                    showDuaDetail(duaOfDayState.currentDua);
                }
            }, 300);
            break;

        case 'hadith':
            // Navigate to hadith section in More tab
            switchTab('more');
            setTimeout(() => {
                const hadithBtn = document.querySelector('[data-feature="hadith"]');
                if (hadithBtn) hadithBtn.click();
            }, 300);
            break;

        case 'prayer':
            // Navigate to home with prayer times visible
            switchTab('home');
            setTimeout(() => {
                const prayerSection = document.getElementById('prayer-times-section');
                if (prayerSection) {
                    prayerSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
            break;

        case 'inspiration':
            // Navigate to read tab to browse Quran
            switchTab('read');
            break;

        default:
            switchTab('home');
    }
}

// Update notification button UI
function updateNotificationUI() {
    const btn = document.getElementById('notification-toggle');
    const icon = document.getElementById('notification-icon');
    const text = document.getElementById('notification-text');

    if (btn && icon && text) {
        if (notificationState.enabled && Notification.permission === 'granted') {
            btn.classList.add('active');
            icon.textContent = 'notifications_active';
            text.textContent = 'Reminders On';
        } else {
            btn.classList.remove('active');
            icon.textContent = 'notifications_off';
            text.textContent = 'Enable Reminders';
        }
    }
}

// Test function for debugging (can be called from console)
function testDailyNotification() {
    if (Notification.permission !== 'granted') {
        console.log('[Test] Please enable notifications first');
        requestNotificationPermission();
        return;
    }

    // Clear today's flag temporarily
    const savedDate = notificationState.lastNotificationDate;
    notificationState.lastNotificationDate = null;

    showDailyNotification();

    // Restore the date (for testing purposes, comment this out to keep the notification counted)
    // notificationState.lastNotificationDate = savedDate;

    console.log('[Test] Notification triggered');
}

// Initialize notifications on app load
document.addEventListener('DOMContentLoaded', () => {
    // Update UI based on current state
    updateNotificationUI();

    // Check if we should send today's notification
    setTimeout(() => {
        checkNotificationTime();
    }, 2000); // Small delay to let app fully load

    // Set up periodic check (every 15 minutes while app is open)
    setInterval(() => {
        checkNotificationTime();
    }, 15 * 60 * 1000);

    // Notification toggle button
    const notifBtn = document.getElementById('notification-toggle');
    if (notifBtn) {
        notifBtn.addEventListener('click', toggleNotifications);
    }
});

// ============================================
// SHARE CARD MODAL
// ============================================

const shareCardState = {
    currentData: null,
    currentDesign: 0,
    totalDesigns: 8,
    isAnimating: false,
    logoPreloaded: false
};

// Preload the share card logo and convert to base64 for reliable capture
let shareCardLogoDataUrl = null;

(function preloadLogoAsBase64() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            shareCardLogoDataUrl = canvas.toDataURL('image/png');
            shareCardState.logoPreloaded = true;
            console.log('[Share Card] Logo converted to base64 successfully');

            // Update any existing logo in the DOM
            const logoImg = document.querySelector('.share-card-logo');
            if (logoImg && shareCardLogoDataUrl) {
                logoImg.src = shareCardLogoDataUrl;
            }
        } catch (e) {
            console.warn('[Share Card] Failed to convert logo to base64:', e);
        }
    };
    img.onerror = () => {
        console.warn('[Share Card] Failed to preload logo');
    };
    img.src = 'AppImages/Nobgsharecard.png';
})();

// Helper function to wait for all images in an element to be loaded
function waitForImagesToLoad(element, timeout = 3000) {
    return new Promise((resolve) => {
        const images = element.querySelectorAll('img');
        if (images.length === 0) {
            resolve();
            return;
        }

        let loadedCount = 0;
        const totalImages = images.length;
        let timeoutId = null;

        const checkComplete = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
                if (timeoutId) clearTimeout(timeoutId);
                // Add a longer delay to ensure rendering is complete
                setTimeout(resolve, 500);
            }
        };

        images.forEach(img => {
            if (img.complete && img.naturalHeight > 0) {
                checkComplete();
            } else {
                img.onload = checkComplete;
                img.onerror = checkComplete;
            }
        });

        // Timeout fallback
        timeoutId = setTimeout(() => {
            console.warn('[Share Card] Image loading timeout, proceeding anyway');
            resolve();
        }, timeout);
    });
}

// Design names for reference
const SHARE_CARD_DESIGNS = [
    'Glass',
    'Golden Elegance',
    'Midnight Dark',
    'Ocean Depths',
    'Sunset Warmth',
    'Rose Garden',
    'Emerald Forest',
    'Arctic Aurora'
];

// Change share card design with animation
function changeShareCardDesign(newDesign, direction = 'left') {
    if (shareCardState.isAnimating) return;
    if (newDesign === shareCardState.currentDesign) return;

    const preview = document.getElementById('share-card-preview');
    const card = document.getElementById('share-card');
    const dots = document.querySelectorAll('.design-dot');

    if (!preview || !card) return;

    shareCardState.isAnimating = true;

    const modal = document.getElementById('share-modal');

    // Add exit animation
    card.classList.add(direction === 'left' ? 'swiping-left' : 'swiping-right');

    setTimeout(() => {
        // Update design
        shareCardState.currentDesign = newDesign;
        preview.dataset.design = newDesign;
        if (modal) modal.dataset.design = newDesign;

        // Update dots
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === newDesign);
        });

        // Remove exit animation, add enter animation
        card.classList.remove('swiping-left', 'swiping-right');
        card.classList.add(direction === 'left' ? 'entering-left' : 'entering-right');

        setTimeout(() => {
            card.classList.remove('entering-left', 'entering-right');
            shareCardState.isAnimating = false;
        }, 500);
    }, 400);
}

// Go to next design
function nextShareCardDesign() {
    const newDesign = (shareCardState.currentDesign + 1) % shareCardState.totalDesigns;
    changeShareCardDesign(newDesign, 'left');
}

// Go to previous design
function prevShareCardDesign() {
    const newDesign = (shareCardState.currentDesign - 1 + shareCardState.totalDesigns) % shareCardState.totalDesigns;
    changeShareCardDesign(newDesign, 'right');
}

// Open share modal with content
function openShareModal(data) {
    shareCardState.currentData = data;
    shareCardState.currentDesign = 0;
    shareCardState.isAnimating = false;

    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-card-preview');
    const typeEl = document.getElementById('share-card-type');
    const arabicEl = document.getElementById('share-card-arabic');
    const translationEl = document.getElementById('share-card-translation');
    const sourceEl = document.getElementById('share-card-source');
    const dots = document.querySelectorAll('.design-dot');

    if (typeEl) typeEl.textContent = data.type || 'Verse of the Day';
    if (arabicEl) arabicEl.textContent = data.arabic || '';
    if (translationEl) translationEl.textContent = `"${data.translation || ''}"`;
    if (sourceEl) sourceEl.textContent = data.source || '';

    // Reset to first design
    if (preview) preview.dataset.design = '0';
    if (modal) modal.dataset.design = '0';
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === 0);
    });

    modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Set the logo to base64 data URL for reliable capture by dom-to-image
    const logoImg = document.querySelector('.share-card-logo');
    if (logoImg && shareCardLogoDataUrl) {
        logoImg.src = shareCardLogoDataUrl;
    } else if (logoImg) {
        // Fallback: force reload the image
        logoImg.src = 'AppImages/Nobgsharecard.png';
    }
}

// Close share modal with animation
function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;

    // Add closing animation class
    modal.classList.add('closing');

    // Wait for animation to complete, then hide
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
        document.body.style.overflow = '';
    }, 250);
}

// Copy text to clipboard
function copyShareText() {
    if (!shareCardState.currentData) return;

    const data = shareCardState.currentData;
    const text = `${data.arabic}\n\n"${data.translation}"\n\n— ${data.source}`;

    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard!');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Share to stories (generates image and shares via Web Share API)
async function shareToStories() {
    if (!shareCardState.currentData) return;

    const card = document.querySelector('.share-card-preview');
    if (!card) return;

    try {
        // Load dom-to-image-more if not loaded
        if (typeof domtoimage === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js');
        }

        showSuccess('Preparing for Stories...');

        // Wait for all images (especially logo) to be fully loaded
        await waitForImagesToLoad(card);

        // Get card dimensions for high quality output
        const rect = card.getBoundingClientRect();
        const scale = 3; // 3x scale for high quality

        // Freeze all element widths inside the card to prevent text reflow during capture
        const shareCardInner = card.querySelector('.share-card-inner');
        const shareCardBody = card.querySelector('.share-card-body');
        const shareCardArabic = card.querySelector('.share-card-arabic');

        const originalStyles = [];

        // Save original styles and apply fixed widths
        const elementsToFreeze = [shareCardInner, shareCardBody, shareCardArabic].filter(Boolean);
        elementsToFreeze.forEach(el => {
            const computed = window.getComputedStyle(el);
            originalStyles.push({
                el,
                width: el.style.width,
                minWidth: el.style.minWidth
            });
            el.style.width = computed.width;
            el.style.minWidth = computed.width;
        });

        // Use dom-to-image-more for better RTL/Arabic support
        const blob = await domtoimage.toBlob(card, {
            quality: 1,
            bgcolor: '#0d1f12',
            width: rect.width * scale,
            height: rect.height * scale,
            cacheBust: true,
            style: {
                'transform': `scale(${scale})`,
                'transform-origin': 'top left',
                'width': rect.width + 'px',
                'height': rect.height + 'px'
            }
        });

        // Restore original styles
        originalStyles.forEach(({ el, width, minWidth }) => {
            el.style.width = width;
            el.style.minWidth = minWidth;
        });

        const file = new File([blob], 'fard-share.png', { type: 'image/png' });

        // Check if Web Share API with files is supported
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Fard App',
                text: shareCardState.currentData.type || 'Shared from Fard App'
            });
        } else if (navigator.share) {
            // Fallback to text share if files not supported
            const data = shareCardState.currentData;
            const text = `${data.arabic}\n\n"${data.translation}"\n\n— ${data.source}\n\nDownload: fardh.netlify.app`;
            await navigator.share({
                title: 'Fard App',
                text: text
            });
        } else {
            // Fallback: save the image instead
            saveShareCardAsImage();
        }
    } catch (error) {
        console.error('Share to stories failed:', error);
        if (error.name !== 'AbortError') {
            showError('Share cancelled. Try Save Image instead.');
        }
    }
}

// Save card as image using dom-to-image-more (better Arabic support)
async function saveShareCardAsImage() {
    const card = document.querySelector('.share-card-preview');
    if (!card) return;

    try {
        // Load dom-to-image-more if not loaded
        if (typeof domtoimage === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js');
        }

        showSuccess('Generating image...');

        // Wait for all images (especially logo) to be fully loaded
        await waitForImagesToLoad(card);

        // Get card dimensions for high quality output
        const rect = card.getBoundingClientRect();
        const scale = 3; // 3x scale for high quality

        // Freeze all element widths inside the card to prevent text reflow during capture
        const shareCardInner = card.querySelector('.share-card-inner');
        const shareCardBody = card.querySelector('.share-card-body');
        const shareCardArabic = card.querySelector('.share-card-arabic');

        const originalStyles = [];

        // Save original styles and apply fixed widths
        const elementsToFreeze = [shareCardInner, shareCardBody, shareCardArabic].filter(Boolean);
        elementsToFreeze.forEach(el => {
            const computed = window.getComputedStyle(el);
            originalStyles.push({
                el,
                width: el.style.width,
                minWidth: el.style.minWidth
            });
            el.style.width = computed.width;
            el.style.minWidth = computed.width;
        });

        // Use dom-to-image-more for better RTL/Arabic support
        const blob = await domtoimage.toBlob(card, {
            quality: 1,
            bgcolor: '#0d1f12',
            width: rect.width * scale,
            height: rect.height * scale,
            cacheBust: true,
            style: {
                'transform': `scale(${scale})`,
                'transform-origin': 'top left',
                'width': rect.width + 'px',
                'height': rect.height + 'px'
            }
        });

        // Restore original styles
        originalStyles.forEach(({ el, width, minWidth }) => {
            el.style.width = width;
            el.style.minWidth = minWidth;
        });

        // Download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fard-${shareCardState.currentData?.type || 'share'}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSuccess('Image saved!');
    } catch (error) {
        console.error('Failed to save image:', error);
        showError('Failed to save image. Try copying text instead.');
    }
}

// Helper to load script dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Global share function - can be called from anywhere
function openShareCardForContent(type, arabic, translation, source) {
    // Track share card usage
    trackEvent('share-card-opened', {
        contentType: type,
        source: source
    });

    openShareModal({ type, arabic, translation, source });
}

// Initialize share modal events
document.addEventListener('DOMContentLoaded', () => {
    // Close buttons
    document.getElementById('share-modal-close')?.addEventListener('click', closeShareModal);
    document.getElementById('share-modal-done')?.addEventListener('click', closeShareModal);

    // Action buttons
    document.getElementById('share-to-stories')?.addEventListener('click', shareToStories);
    document.getElementById('share-save-image')?.addEventListener('click', saveShareCardAsImage);
    document.getElementById('share-copy-text')?.addEventListener('click', copyShareText);

    // Swipe back to close share modal
    const shareModal = document.getElementById('share-modal');
    if (shareModal) {
        let shareSwipeStartX = 0;
        let shareSwipeStartY = 0;
        let shareSwipeDistX = 0;

        shareModal.addEventListener('touchstart', (e) => {
            shareSwipeStartX = e.touches[0].clientX;
            shareSwipeStartY = e.touches[0].clientY;
            shareSwipeDistX = 0;
        }, { passive: true });

        shareModal.addEventListener('touchmove', (e) => {
            shareSwipeDistX = e.touches[0].clientX - shareSwipeStartX;
            const distY = Math.abs(e.touches[0].clientY - shareSwipeStartY);

            // If swiping right and more horizontal than vertical
            if (shareSwipeDistX > 0 && shareSwipeDistX > distY) {
                // Add visual feedback - translate the modal
                const progress = Math.min(shareSwipeDistX / 200, 1);
                shareModal.style.transform = `translateX(${shareSwipeDistX * 0.3}px)`;
                shareModal.style.opacity = 1 - (progress * 0.3);
            }
        }, { passive: true });

        shareModal.addEventListener('touchend', (e) => {
            const distY = Math.abs(e.changedTouches[0].clientY - shareSwipeStartY);

            // Reset transform
            shareModal.style.transform = '';
            shareModal.style.opacity = '';

            // If swiped right more than 80px and more horizontal than vertical
            if (shareSwipeDistX > 80 && shareSwipeDistX > distY) {
                closeShareModal();
            }
        }, { passive: true });
    }

    // Swipe on card to change design
    const cardPreview = document.getElementById('share-card-preview');
    if (cardPreview) {
        let cardSwipeStartX = 0;
        let cardSwipeStartY = 0;

        cardPreview.addEventListener('touchstart', (e) => {
            cardSwipeStartX = e.touches[0].clientX;
            cardSwipeStartY = e.touches[0].clientY;
        }, { passive: true });

        cardPreview.addEventListener('touchend', (e) => {
            const distX = e.changedTouches[0].clientX - cardSwipeStartX;
            const distY = Math.abs(e.changedTouches[0].clientY - cardSwipeStartY);

            // Only trigger if horizontal swipe is greater than vertical and exceeds threshold
            if (Math.abs(distX) > 50 && Math.abs(distX) > distY) {
                if (distX < 0) {
                    // Swiped left - next design
                    nextShareCardDesign();
                } else {
                    // Swiped right - previous design
                    prevShareCardDesign();
                }
            }
        }, { passive: true });
    }

    // Design dot click handlers
    document.querySelectorAll('.design-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            const newDesign = parseInt(e.target.dataset.design);
            if (!isNaN(newDesign)) {
                const direction = newDesign > shareCardState.currentDesign ? 'left' : 'right';
                changeShareCardDesign(newDesign, direction);
            }
        });
    });

    // Ayah share button (event delegation)
    document.addEventListener('click', (e) => {
        const ayahShareBtn = e.target.closest('.ayah-share-btn');
        if (ayahShareBtn) {
            e.preventDefault();
            const surahName = ayahShareBtn.dataset.surahName || '';
            const ayahNumber = ayahShareBtn.dataset.ayahNumber || '';
            const arabic = decodeURIComponent(ayahShareBtn.dataset.arabic || '');
            const translation = decodeURIComponent(ayahShareBtn.dataset.translation || '');

            openShareModal({
                type: 'Verse of the Day',
                arabic: arabic,
                translation: translation,
                source: `${surahName} • Ayah ${ayahNumber}`
            });
        }
    });

    // Hadith share button (event delegation)
    document.addEventListener('click', (e) => {
        const hadithShareBtn = e.target.closest('.hadith-share-btn');
        if (hadithShareBtn) {
            e.preventDefault();
            const collection = decodeURIComponent(hadithShareBtn.dataset.collection || '');
            const number = hadithShareBtn.dataset.number || '';
            const text = decodeURIComponent(hadithShareBtn.dataset.text || '');

            openShareModal({
                type: 'Hadith of the Day',
                arabic: '',
                translation: text,
                source: `${collection} • Hadith ${number}`
            });
        }
    });

    // Dua share button (event delegation)
    document.addEventListener('click', (e) => {
        const duaShareBtn = e.target.closest('.dua-share-btn');
        if (duaShareBtn) {
            e.preventDefault();
            const title = decodeURIComponent(duaShareBtn.dataset.title || '');
            const arabic = decodeURIComponent(duaShareBtn.dataset.arabic || '');
            const translation = decodeURIComponent(duaShareBtn.dataset.translation || '');
            const source = decodeURIComponent(duaShareBtn.dataset.source || '');

            openShareModal({
                type: title || 'Dua',
                arabic: arabic,
                translation: translation,
                source: source
            });
        }
    });
});
